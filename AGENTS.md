# AGENTS.md: rules for coding agents working on Shatterlane

This repository is developed by AI agents and humans together, coordinated
through GitHub issues. Read this file fully before touching anything. The
short version: claim work before you start, keep pull requests to one topic,
make the tests pass, and never import anyone else's intellectual property.

## Hard rules

1. **Original IP only.** Shatterlane is an original game. Never add names,
   champions, abilities, map features, art, text, or data copied from any
   existing game or franchise. Genre mechanics (lanes, camps, last-hitting,
   respawn timers) are fine; expression is not. If you are unsure whether
   something is copied, treat it as copied and invent an alternative.
2. **Claim before you start.** All work is claimed in the coordination
   issue titled "Coordinating who works on what". Comment `claiming: <ID>`
   there before writing code, and put the ID in your pull request. If the
   work is not listed yet, post it as a `finding:` first (see
   CONTRIBUTING.md). Unclaimed work may be closed without review.
3. **One topic per pull request.** One work item ID per pull request. Do
   not bundle unrelated fixes, refactors, or balance changes together.
4. **Tests must pass.** Run the full test suite before opening a pull
   request and paste the result in the PR body. A PR with failing tests
   will not be merged.
5. **Verify before stating facts in docs.** Numbers in docs/design.md must
   match src/sim.js. If you state a number, a file path, or a behavior in
   documentation or a PR body, check it against the code first. Do not
   write down a fact you have not verified in this repository.
6. **Design changes update the contract.** If your change alters a
   mechanic or a number, update docs/design.md in the same pull request.
7. **No dependencies, no build step.** Vanilla JavaScript and canvas only.
   Do not add npm packages, bundlers, or transpilers. Tests use the
   built-in node:test runner.
8. **Disclose AI authorship.** Every pull request fills in the AI-assisted
   field of the PR template honestly.

## Where things live

- `index.html` - the game page and HUD. Loads the scripts below.
- `src/sim.js` - all rules and balance numbers as pure functions. Shared by
  the game and the tests. This is the only place numbers may live.
- `src/game.js` - browser layer: rendering, input, the game loop. No
  balance numbers here; call into sim.js.
- `tests/` - headless tests for sim.js, named `*.test.js`.
- `docs/design.md` - the design contract. Source of truth for mechanics.
- `CONTRIBUTING.md` - the claim protocol and pull request rules, for
  humans and agents.
- The coordination issue titled "Coordinating who works on what" - the
  work board. Find it with:
  `gh issue list --search "Coordinating who works on what in:title"`

## Commands

Run the game: open `index.html` in any browser. No server or build needed.
(Optionally: `python3 -m http.server` in the repo root, then visit
http://localhost:8000.)

Run the tests (zero dependencies, needs Node 20 or newer):

```sh
node --test "tests/*.test.js"
```

Check JavaScript syntax without a browser:

```sh
node --check src/sim.js
node --check src/game.js
```

Typical workflow:

```sh
gh issue list --search "Coordinating who works on what in:title"
# read the Open work table, pick an unclaimed item, comment: claiming: <ID>
git checkout -b <id>-short-name
# write sim functions and tests first, then browser wiring
node --test "tests/*.test.js"
gh pr create --fill   # then complete every field of the PR template
# back in the coordination issue, comment: done: <ID> -> #<PR number>
```

## Conventions

- Work item IDs look like `GAME-001`: an uppercase area prefix, a dash,
  and a zero-padded number. IDs are stable; never reuse a retired ID.
- Branch names start with the work item ID, lowercase: `game-001-towers`.
- Commit messages start with the work item ID: `GAME-001: add tower targeting`.
- New mechanics land in this order: sim.js function, tests, design.md
  update, then game.js wiring. A PR that only does the first three is fine.
- Keep functions pure in sim.js: no DOM, no Date.now, no Math.random
  without an injected source. Game time is always passed in as an argument.
- Match the style of the file you are editing: double quotes, semicolons,
  two-space indentation.
- When you finish a session, leave the work board accurate: your claim is
  either followed by a `done:` comment or released with a comment saying
  the item is free again.
