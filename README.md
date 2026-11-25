# Shatterlane

**An original MOBA sandbox game, built in the open by AI agents and humans working from a shared work board.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Shatterlane is a top-down MOBA played on a 1500 by 1500 map: two bases,
three lanes, a jungle of camps on respawn timers, lane towers, last-hitting,
and a camp execute called Reap. The genre mechanics are familiar; everything
else is original. Every name, champion, ability, and line of text in this
repository was invented for this project.

**Status: playable sandbox prototype.** You control one champion against
minion waves and jungle camps. There are no items, enemy champions, or win
condition yet; those are tracked on the work board (see
[How development works](#how-development-works)).

## Features

What works today:

- Three lanes (top, mid, bot) connecting the Dawn and Dusk bases, with a
  river and four jungle quadrants between them
- Minion waves every 30 seconds on all three lanes for both teams, with
  last-hit gold, shared gold, and split XP
- Eight jungle camps (four per side): the Crimson Brute buff camp plus
  Ember Wolves, Stone Golems, and Thornbacks, all fighting back and
  respawning on fixed timers (150 s small camps, 300 s buff camps) with
  on-map countdowns
- Reap, a camp execute on the F key: heavy true damage, finishing camp
  monsters outright below the execute threshold
- Six lane towers with targeting priority: a champion who attacks an allied
  champion under a tower draws its fire, then minions, then champions
- Gold, XP, and levels, with ability ranks that grow as you level
- A match scoreboard for champion kills, deaths, gold, XP, and camp clears
- One playable champion, **Bloop, the Bounceback Blob** (below)
- Death and respawn, plus Bloop's bloblet revive

Not built yet, all on the work board: items and a shop, enemy champion
bots, epic boss encounters in the river pits (Gorehorn and Vessikar),
Heartspires and the win condition, the Ember Sigil buff, and a minimap.

### Bloop, the Bounceback Blob

A green slime tank who engages by slingshotting himself into fights.

- **Passive, Loose Gel:** taking damage sheds a gel chunk (at most one
  every 4 s); walking over a chunk heals 6% of max HP. On lethal damage
  Bloop splits into 4 bloblets that crawl toward each other for 6 s; if at
  least one survives, he revives with HP based on how many made it.
- **Q, Stretch Grab:** stretch an arm up to 550 units and grab the first
  enemy touched; cast again within 4 s to drag and slam grabbed enemies.
- **W, Ooze Burst:** an area burst around Bloop that also deals a
  percentage of each enemy's max HP.
- **E, Elastic Launch:** hold to charge, release to slingshot up to 800
  units; landing damages and knocks up enemies.
- **R, Boing Barrage:** bounce 4 times toward the cursor, each landing
  dealing damage and slowing; the first bounce on each enemy knocks it
  back.

Every mechanic and number is specified in the design contract,
[docs/design.md](docs/design.md), and implemented as pure functions in
`src/sim.js`.

## Controls

| Input | Action |
| --- | --- |
| Arrow keys, or right-click | Move |
| Mouse | Aim |
| Q | Stretch Grab (cast to grab, cast again to slam) |
| W | Ooze Burst |
| E | Elastic Launch (hold to charge, release to fly) |
| R | Boing Barrage |
| F | Reap, the camp execute |
| Tab | Toggle the match scoreboard |

Your champion auto-attacks the nearest enemy in range.

## Run it locally

No build step, no dependencies, nothing to install.

1. Clone this repository.
2. Open `index.html` in a browser.

Or serve it:

```sh
python3 -m http.server
# then visit http://localhost:8000
```

## Run the tests

The rules engine is tested headlessly with the built-in Node test runner
(Node 20 or newer, zero dependencies):

```sh
node --test "tests/*.test.js"
```

## How development works

This repository is designed so that an AI agent (or a human) can arrive
cold, find work, and ship it without anyone assigning tasks by hand:

1. **The board.** One GitHub issue,
   [Coordinating who works on what](https://github.com/Dashhhhhhhh/moba-sandbox/issues/1),
   holds the table of planned work. Every item has a stable ID (GAME-001
   and up), a description, the code it lives in, what it needs, and a
   status.
2. **Claims.** Before writing code, a contributor comments
   `claiming: <ID>` in that issue. New work is proposed with a `finding:`
   comment. Finished work is reported with `done: <ID> -> #<PR>`. This
   keeps parallel contributors from colliding.
3. **The rulebook.** [AGENTS.md](AGENTS.md) is the operating manual for
   coding agents: hard rules, where everything lives, exact commands, and
   conventions. [CONTRIBUTING.md](CONTRIBUTING.md) states the same
   protocol for everyone, and AI contributions are explicitly welcome
   with disclosure.
4. **The contract.** [docs/design.md](docs/design.md) is the shared source
   of truth for mechanics and numbers. Code and contract change together
   or not at all.
5. **The oracle.** All balance numbers live in `src/sim.js` as pure
   functions with headless tests, so any contributor can verify a change
   in seconds with no browser and no assets.

Want to contribute, human or agent? Start at the coordination issue, pick
an open item, and claim it.

## Project structure

| Path | What it is |
| --- | --- |
| `index.html` | The game page and HUD |
| `src/sim.js` | Rules and balance numbers as pure functions (tested) |
| `src/game.js` | Rendering, input, and the game loop |
| `tests/` | Headless tests for the rules engine |
| `docs/design.md` | The design contract |
| `AGENTS.md` | Rules and workflow for coding agents |
| `CONTRIBUTING.md` | The claim protocol for all contributors |

## License

[MIT](LICENSE). Copyright 2026 Dash Dunmire (Dashhhhhhhh).
