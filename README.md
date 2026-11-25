# Shatterlane

An original MOBA sandbox game, developed in the open by AI agents and
humans working from a shared board. Three lanes, a jungle full of camps on
respawn timers, river objectives, last-hitting, and a camp execute called
Reap. Genre mechanics, original everything: every name, champion, ability,
and line of text in this repository was invented for this project.

**Status:** playable sandbox prototype. One champion, minion waves on mid
lane, clearable jungle camps, gold, XP, and levels. No structures, items,
or enemy champions yet; those are on the work board.

## Play the prototype

No build step, no dependencies, nothing to install.

1. Clone this repository.
2. Open `index.html` in a browser. (Or run `python3 -m http.server` in the
   repo root and visit http://localhost:8000.)

### Controls

- **Move:** arrow keys, or right-click a destination.
- **Aim:** mouse.
- **Q / W / E / R:** abilities (Stretch Grab, Ooze Burst, Elastic Launch,
  Boing Barrage). Q is two-part: cast to grab, cast again to slam.
  E is hold-and-release: hold to charge the launch, release to fly.
- **F:** Reap, the camp execute. Use it on a camp monster to deal heavy
  true damage, or to finish it outright below the execute threshold.
- Your champion auto-attacks the nearest enemy in range. Last-hit red
  minions for full gold, clear camps between waves, and watch the respawn
  timers printed on cleared camps to plan your next route.

You play **Bloop, the Bounceback Blob**, the first champion: a green slime
tank whose passive drops healing gel chunks when he is hurt and splits him
into bloblets instead of letting him die. The design contract in
[docs/design.md](docs/design.md) documents every mechanic and number in
the game.

## Run the tests

The rules engine is tested headlessly with zero dependencies (Node 20+):

```sh
node --test "tests/*.test.js"
```

## How the self-development system works

This repository is designed so that an AI agent (or a human) can arrive
cold, find work, and ship it without anyone assigning tasks by hand:

1. **The board.** One GitHub issue, titled "Coordinating who works on
   what", holds a table of planned work:
   https://github.com/Dashhhhhhhh/moba-sandbox/issues/1
   Every item has a stable ID (GAME-001 and up), a description, the code
   it lives in, what it needs, and a status.
2. **Claims.** Before writing code, a contributor comments
   `claiming: <ID>` in that issue. New work is proposed with a
   `finding:` comment. Finished work is reported with
   `done: <ID> -> #<PR>`. This keeps parallel agents from colliding.
3. **The rulebook.** [AGENTS.md](AGENTS.md) is the operating manual for
   coding agents: hard rules, where everything lives, exact commands, and
   conventions. [CONTRIBUTING.md](CONTRIBUTING.md) states the same
   protocol for everyone.
4. **The contract.** [docs/design.md](docs/design.md) is the shared source
   of truth for mechanics and numbers. Code and contract change together
   or not at all.
5. **The oracle.** All balance numbers live in `src/sim.js` as pure
   functions with headless tests, so any contributor can verify a change
   in seconds with no browser and no assets.

Want to contribute, human or agent? Start at the coordination issue, pick
an open item, and claim it.

## Layout

- `index.html` - game page and HUD
- `src/sim.js` - rules and numbers (pure functions, tested)
- `src/game.js` - rendering, input, game loop
- `tests/` - headless tests for the rules engine
- `docs/design.md` - the design contract
