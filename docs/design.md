# Shatterlane design contract

This document is the shared source of truth for how Shatterlane works. The
code in `src/sim.js` implements the numbers written here. When a pull request
changes a mechanic, it updates this document in the same pull request. If the
code and this document disagree, that is a bug in one of them; say which one
you are fixing in the pull request.

Shatterlane is an original game. Its mechanics are inspired by the MOBA
genre; every name, character, ability, and piece of text in this repository
is original to this project.

## The map

- Square map, 1500 by 1500 world units, viewed top-down.
- Two bases on opposite corners: the Dawn base (bottom-left, blue) and the
  Dusk base (top-right, red). Each base holds a Heartspire, the structure a
  team defends.
- Three lanes connect the bases: top (through the top-left corner), mid
  (straight diagonal), and bot (through the bottom-right corner).
- A river runs along the other diagonal, from top-left to bottom-right,
  crossing mid lane at the map centre.
- The jungle is everything between the lanes, split into four quadrants by
  the lanes and the river.
- Two epic pits sit on the river at (500, 500) and (1000, 1000):
  - North pit: Gorehorn, the Hollow Elder (boss encounter is GAME-006).
  - South pit: Vessikar, the Tidewyrm (boss encounter is GAME-006).
- Each side of the jungle holds four camps, mirrored through the centre:
  - Crimson Brute (buff camp, 1 monster): will grant the Ember Sigil buff
    when slain (buff effect is future work; the camp ships in the
    prototype without it).
  - Ember Wolves (small camp, 2 monsters).
  - Stone Golems (small camp, 2 monsters).
  - Thornbacks (small camp, 2 monsters).

## Core loop

1. Minion waves march down the lanes and fight. Killing an enemy minion with
   the final blow (a last hit) pays full gold; nearby allies share XP.
2. Between waves, champions clear jungle camps for gold and XP. Camps
   respawn on fixed timers, so efficient players plan routes around them.
3. Gold buys items (item system is future work), XP levels the champion up
   and strengthens abilities.
4. Teams take epic objectives on the river for team-wide power, push lanes,
   destroy the enemy Heartspire, and win.

## Numbers (implemented in src/sim.js)

### Economy

- Starting gold: 475.
- Last-hit gold: melee minion 21, caster minion 17, siege minion 35.
- Shared gold when a nearby minion dies without your last hit: 6.
- Ambient gold: 3 gold every 5 seconds, starting at 1:00 game time.
- Minion XP: melee 60, caster 30, siege 90, split evenly (floor) among
  nearby allies.
- XP to level: going from level L to L+1 costs 180 + (L - 1) * 90 XP.

### Camps

- Respawn after a full clear: small camps 150 s, buff camps 300 s, epic
  objectives 360 s. The timer starts when the last monster of the camp dies.
- Camp rewards (gold and XP to the clearing champion): small camps 65 to 75
  gold and 90 to 100 XP by camp, buff camps 90 gold and 120 XP.

### Combat

- Physical mitigation: damage * 100 / (100 + armor) for positive armor;
  negative armor amplifies with the mirrored curve. Magic uses the same
  curve against magic resist.
- Minion waves: every 30 s from both bases on mid lane in the prototype
  (all three lanes are future work). A wave is 3 melee + 3 caster minions,
  plus a siege minion every third wave.

### Reap (the camp execute)

- Every champion has Reap on the F key: a camp-monster execute.
- Damage: 450 + 40 per champion level above 1, true damage, only against
  camp monsters, range 320, cooldown 15 s (sandbox tuning so players can
  practice the timing often).

### Launch champion: Korrin, the Briar Knight

- Q, Briar Lash: line skillshot, physical damage 70 to 210 by rank plus
  0.7 bonus attack damage. Cooldown 7 s, mana 50.
- W, Root Snare: targeted area, magic damage 60 to 200 by rank plus 0.6
  ability power, roots hit enemies for 1.0 to 1.6 s by rank. Cooldown 12 s,
  mana 70.
- E, Thorn Dash: dash up to 425 units toward the cursor, physical damage
  40 to 140 by rank plus 0.5 bonus attack damage to enemies at the landing
  point. Cooldown 10 s, mana 40.
- R, Verdant Cataclysm: large area around Korrin, magic damage 200 to 400
  by rank plus 0.9 ability power. Cooldown 90 s, mana 100.

## Win condition

Destroy the enemy Heartspire. In the current sandbox prototype there are no
structures yet, so there is no win or loss; the prototype is for practicing
movement, last-hitting, and camp clears. Structures are GAME-001 and
GAME-009 on the coordination board.

## Sandbox scope

- Single player controlling one champion, plus simple scripted bots:
  allied and enemy minion waves, and camp monsters that fight back.
- No networking, no accounts, no items, no shop in the prototype.
- Enemy champion bots are GAME-003. Towers are GAME-001.

## Tech constraints

- Vanilla JavaScript and HTML5 canvas. No build step, no bundler, no
  runtime dependencies. Opening index.html in a browser runs the game.
- All rules and balance numbers live in src/sim.js as pure functions so
  they can be tested headlessly. Rendering and input live in src/game.js.
- Tests use the built-in node:test runner with zero dependencies:
  `node --test "tests/*.test.js"`.
- New mechanics must land with sim functions and tests first, then the
  browser wiring that uses them.
