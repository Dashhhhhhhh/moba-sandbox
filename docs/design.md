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
- Level growth: +95 max HP, +35 max mana, and +4 attack damage per
  level; leveling up restores 120 HP and refills mana.
- Respawn after death: 5 s plus 0.5 s per level.

### Camps

- Respawn after a full clear: small camps 150 s, buff camps 300 s, epic
  objectives 360 s. The timer starts when the last monster of the camp dies.
- Camp combat and reward values live in `Sim.CAMP_STATS`; map positions
  remain in `src/game.js`.

| Camp | Monsters | HP each | Damage | Radius | Gold | XP |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Crimson Brute | 1 | 950 | 22 | 24 | 90 | 120 |
| Ember Wolves | 2 | 520 | 11 | 17 | 70 | 95 |
| Stone Golems | 2 | 640 | 13 | 17 | 75 | 100 |
| Thornbacks | 2 | 480 | 12 | 17 | 65 | 90 |

- Camp monsters have 12 armor and 12 magic resist, assigned from
  `Sim.CAMP_STATS` when they spawn.

### Combat

- Physical mitigation: damage * 100 / (100 + armor) for positive armor;
  negative armor amplifies with the mirrored curve. Magic uses the same
  curve against magic resist.
- Minion combat stats live in `Sim.MINION_STATS`.

| Minion | HP | Damage | Range | Radius | Speed |
| --- | ---: | ---: | ---: | ---: | ---: |
| Melee | 480 | 11 | 105 | 13 | 105 |
| Caster | 290 | 16 | 280 | 12 | 105 |
| Siege | 850 | 22 | 120 | 17 | 95 |

- Minion waves: every 30 s from both bases on all three lanes. Each lane's
  wave is 3 melee + 3 caster minions, plus a siege minion every third wave.

### Towers

- One tower per lane per side, placed 35% of the lane's length from its
  own base (six towers total). Stats: 2500 HP, 30 armor, shot damage
  160 (physical, mitigated by the target's armor), range 260, one shot
  every 1.2 s.
- Targeting, in order: (1) an enemy champion who damaged an allied
  champion while both were in this tower's range keeps the tower's
  attention for 3 s; (2) the nearest enemy minion in range; (3) the
  nearest enemy champion in range.
- Minions treat towers as targets and stop to attack them. Champions
  damage towers with basic attacks only; abilities do not damage towers
  in the prototype. A destroyed tower stays on the map as rubble and no
  longer shoots.

### Reap (the camp execute)

- Every champion has Reap on the F key: a camp-monster execute.
- Damage: 450 + 40 per champion level above 1, true damage, only against
  camp monsters, range 320, cooldown 15 s (sandbox tuning so players can
  practice the timing often).

### Launch champion: Bloop, the Bounceback Blob

Champion definitions and base stats live in `src/sim.js`; browser gameplay
and headless tools read from that shared catalog. The
[CommunityDragon documentation](https://communitydragon.org/docs) is a
structural reference for organizing game data only. Shatterlane does not
import League of Legends stats, names, or assets.

An original green slime champion: a bouncy tank who engages by
slingshotting himself into fights. Base stats in the prototype: 680 HP,
300 mana, 62 attack damage, 32 armor, 32 magic resist, 335 move speed,
150 attack range, and a 0.9-second attack period.

- Passive, Loose Gel: when Bloop takes damage, a chunk of gel drops off
  (at most one every 4 s, chunks last 25 s). Walking over a chunk heals
  him for 6% of his max HP. On lethal damage, instead of dying he splits
  into 4 bloblets, each with 12% of his max HP, which crawl toward each
  other for 6 s while enemies can hunt them. If at least one bloblet is
  alive when the 6 s end, Bloop revives at their meeting point with 10%
  of max HP plus 5% per surviving bloblet (30% if all four make it). If
  every bloblet dies, Bloop dies for real. Passive cooldown 90 s,
  counted from the split.
- Q, Stretch Grab: two-part cast. First cast stretches an arm up to 550
  units toward the cursor and grabs the first enemy it touches; a
  grabbed enemy cannot move or attack. Recast within 4 s drags the
  grabbed enemies to the cursor point and slams them together for magic
  damage 60 to 200 by rank plus 0.6 ability power. The grab itself deals
  no damage. Cooldown 11 s from the first cast, mana 55.
- W, Ooze Burst: Bloop detonates his own ooze in a burst of radius 230
  around him. Magic damage 50 to 150 by rank plus 0.3 ability power,
  plus 5% to 9% of each enemy's max HP by rank (the max-health part is
  mitigated like the rest). Cooldown 10 s, mana 60.
- E, Elastic Launch: hold E to charge (Bloop cannot move while
  charging), release to slingshot toward the cursor. Launch distance
  scales with charge time: 300 units uncharged up to 800 units at the
  full 1.2 s charge. On landing, enemies within 200 units take magic
  damage 60 to 180 by rank plus 0.5 ability power and are knocked up
  for 1.0 s. Cooldown 14 s, mana 60.
- R, Boing Barrage: Bloop bounces 4 times, one bounce every 0.75 s,
  hopping up to 180 units toward the cursor with each bounce. Each
  landing deals magic damage 120 to 220 by rank plus 0.4 ability power
  to enemies within 240 units and slows them by 30% for 1.0 s. The
  first bounce that hits a given enemy also knocks it back 120 units.
  Cooldown 100 s, mana 100. Unlocks at level 6.

## Win condition

Destroy the enemy Heartspire. In the current sandbox prototype the lane
towers exist (GAME-001, done) but Heartspires do not, so there is still no
win or loss; the prototype is for practicing movement, last-hitting, camp
clears, and pushing lanes into towers. Heartspires and the win condition
are GAME-009 on the coordination board.

## Sandbox scope

- Single player controlling one champion, plus simple scripted bots:
  allied and enemy minion waves, and camp monsters that fight back.
- No networking, no accounts, no items, no shop in the prototype.
- Enemy champion bots are GAME-003. Lane towers shipped with GAME-001.

## Tech constraints

- Vanilla JavaScript and HTML5 canvas. No build step, no bundler, no
  runtime dependencies. Opening index.html in a browser runs the game.
- All rules and balance numbers live in src/sim.js as pure functions so
  they can be tested headlessly. Rendering and input live in src/game.js.
- Tests use the built-in node:test runner with zero dependencies:
  `node --test "tests/*.test.js"`.
- New mechanics must land with sim functions and tests first, then the
  browser wiring that uses them.
