# Sky Courier

[![make.fun](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/endodo713/best-flight-game-20261126-0057/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/endodo713/best-flight-game-20261126-0057/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

A complete, original flight game that plays offline in a desktop browser
from its own static files. You are a bush pilot flying cargo between the
airstrips of the Merpati island chain: take off, thread the glowing target
rings, mind your fuel, and bring her down soft on the next strip.

## How to play

Open `game/index.html` in desktop Chrome (serve `game/` with any static
server, or just open the file — it needs no network at all).

| Key | Action |
|-----|--------|
| Up / Down | Pitch down / up |
| Left / Right | Bank and turn |
| W / S | Throttle up / down |
| G | Toggle cockpit / chase camera |
| P | Pause |
| R | Restart the sortie |
| M | Mute sound |

Mouse: click the on-screen buttons on the title and debrief screens.

## Sorties

1. **First Light** — North Field to South Strip, 3 rings, calm morning air.
2. **Island Hop** — 5 rings across the lagoon, crosswind picks up.
3. **Storm Courier** — 6 rings at dusk, tight fuel, gusty air. Land it.

Score comes from rings flown, landing quality (soft touchdown, on the
centreline, inside the speed window), and time left. Hard landings cost
airframe damage; three hard knocks or an empty tank ends the sortie.

## Under the hood

- `game/index.html` — page, import map, HUD overlay.
- `game/src/config.js` — tuning constants and mission data.
- `game/src/random.js` — seeded RNG so the islands are the same every run.
- `game/src/world.js` — terrain, sea, sky, clouds, trees, runways, rings.
- `game/src/plane.js` — the aircraft model and the arcade flight model.
- `game/src/hud.js` — instruments: airspeed, altitude, heading, horizon, fuel.
- `game/src/missions.js` — sortie flow, rings, landing checks, scoring.
- `game/src/audio.js` — synthesised engine, wind and chime sounds (WebAudio).
- `game/src/input.js` — keyboard and mouse controls.
- `game/src/shots.js` — deterministic screenshot poses (`?shot=start|play|cockpit|end`).
- `game/src/main.js` — bootstrap, game loop, state machine.
- `game/vendor/three.module.min.js` — vendored Three.js r170 (MIT).

`main.ts` (Node 22, standard library only) copies `game/` and
`screenshots/` to `/output` and writes `/output/dossier.json`.
