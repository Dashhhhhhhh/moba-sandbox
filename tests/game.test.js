"use strict";

/*
 * Headless tests for src/game.js. The browser layer is an IIFE over a
 * stubbed DOM, so this harness loads it with document/canvas stubs and
 * exposes the IIFE internals through an in-memory copy of the source
 * (the file on disk is never modified). Steps run the update functions
 * in the same order as the real frame loop.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Sim = require("../src/sim.js");

function loadGame() {
  const canvasStub = {
    width: 900,
    height: 900,
    getContext: function () {
      return new Proxy(
        {},
        {
          get: function (t, p) {
            if (p === Symbol.toPrimitive) return undefined;
            return function () {};
          },
          set: function () {
            return true;
          },
        }
      );
    },
    getBoundingClientRect: function () {
      return { left: 0, top: 0, width: 900, height: 900 };
    },
    addEventListener: function () {},
  };
  global.window = {
    Sim: Sim,
    addEventListener: function () {},
  };
  global.document = {
    getElementById: function (id) {
      if (id === "game") return canvasStub;
      return { textContent: "", style: {} };
    },
  };
  global.requestAnimationFrame = function () {};

  let gameSrc = fs.readFileSync(path.join(__dirname, "../src/game.js"), "utf8");
  const exportSnippet =
    "window.__T = { state: state, hero: hero, Sim: Sim, " +
    "castAbility: castAbility, castReap: castReap, startCharge: startCharge, " +
    "releaseLaunch: releaseLaunch, damageUnit: damageUnit, gainXp: gainXp, " +
    "updateHero: updateHero, updateMinions: updateMinions, updateCamps: updateCamps, " +
    "updateTowers: updateTowers, updateProjectiles: updateProjectiles, " +
    "spawnWave: spawnWave, enemiesInRadius: enemiesInRadius, " +
    "BLUE_BASE: BLUE_BASE, RED_BASE: RED_BASE, LANES: LANES, WORLD: WORLD };\n";
  const idx = gameSrc.lastIndexOf("})();");
  if (idx < 0) throw new Error("could not find IIFE close in game.js");
  gameSrc = gameSrc.slice(0, idx) + exportSnippet + gameSrc.slice(idx);
  (0, eval)(gameSrc);
  return global.window.__T;
}

// Advance the game by `seconds` in fixed dt steps, calling the update
// functions in the same order as the real frame loop.
function step(T, seconds, dt) {
  dt = dt || 0.05;
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i += 1) {
    T.state.time += dt;
    T.updateHero(dt);
    T.updateMinions(dt);
    T.updateCamps(dt);
    T.updateTowers(dt);
    T.updateProjectiles(dt);
  }
}

// Park the hero somewhere quiet and keep waves from interfering.
function parkHero(T, x, y) {
  T.hero.x = x;
  T.hero.y = y;
  T.state.minions.length = 0;
  T.state.lastWaveAt = T.state.time;
}

// A red melee minion built the way spawnWave builds them.
function meleeMinion(T, x, y) {
  const s = Sim.MINION_STATS.melee;
  return {
    team: "red", kind: "melee", x: x, y: y, radius: s.radius,
    maxHp: s.hp, hp: s.hp, armor: s.armor, magicResist: s.magicResist,
    damage: s.damage, range: s.range, speed: s.speed,
    path: T.LANES.mid, waypoint: 1, attackCooldown: 0, rootUntil: 0,
    lastAttacker: null,
  };
}

test("boing barrage cannot be cast before level 6", function () {
  const T = loadGame();
  parkHero(T, 750, 750);
  assert.equal(T.hero.level, 1);
  T.castAbility("boingBarrage");
  assert.equal(T.hero.bounce, null);
  assert.equal(T.hero.mana, T.hero.maxMana);
  assert.equal(T.hero.cooldowns.boingBarrage, 0);
});

test("camp monsters spawn with catalog armor and resist", function () {
  const T = loadGame();
  T.state.camps.forEach(function (camp) {
    camp.monsters.forEach(function (mon) {
      assert.equal(mon.armor, camp.def.stats.armor);
      assert.equal(mon.magicResist, camp.def.stats.magicResist);
    });
  });
});

test("basic attacks on a camp monster do not depend on touch order", function () {
  // Untouched monster: the first basic attack uses its spawn armor.
  const T = loadGame();
  parkHero(T, 300, 900);
  const camp = T.state.camps.find(function (c) { return c.def.id === "blue-wolves"; });
  const wolf = camp.monsters[0];
  T.hero.x = wolf.x + 100;
  T.hero.y = wolf.y;
  const hpA = wolf.hp;
  step(T, 0.05);
  const hitUntouched = hpA - wolf.hp;

  // Ability-touched monster: an Ooze Burst radius query touches it
  // first, then the first basic attack lands.
  const T2 = loadGame();
  parkHero(T2, 300, 900);
  const camp2 = T2.state.camps.find(function (c) { return c.def.id === "blue-wolves"; });
  const wolf2 = camp2.monsters[0];
  T2.hero.x = wolf2.x;
  T2.hero.y = wolf2.y;
  T2.castAbility("oozeBurst");
  const hpB = wolf2.hp;
  step(T2, 0.05);
  const hitTouched = hpB - wolf2.hp;

  const expected = Sim.mitigatePhysical(62, 12);
  assert.ok(Math.abs(hitUntouched - expected) < 0.01, "untouched hit " + hitUntouched);
  assert.ok(Math.abs(hitTouched - expected) < 0.01, "touched hit " + hitTouched);
});

test("minion attacks are mitigated by the target's armor", function () {
  // Against the hero (32 armor). Parked at (400, 400), away from every
  // tower and camp so only the minion and hero regen move his HP.
  const T = loadGame();
  parkHero(T, 400, 400);
  T.state.minions.push(meleeMinion(T, 450, 400));
  const hp0 = T.hero.hp; // full HP, so the frame's regen is capped away
  step(T, 0.05);
  const heroDrop = hp0 - T.hero.hp;
  assert.ok(Math.abs(heroDrop - Sim.mitigatePhysical(11, 32)) < 0.01, "hero drop " + heroDrop);

  // Against a tower (30 armor).
  const T2 = loadGame();
  parkHero(T2, 400, 400);
  const tower = T2.state.towers.find(function (t) { return t.team === "blue" && t.lane === "mid"; });
  T2.state.minions.push(meleeMinion(T2, tower.x + 50, tower.y));
  const towerHp0 = tower.hp;
  step(T2, 0.05);
  const towerDrop = towerHp0 - tower.hp;
  assert.ok(Math.abs(towerDrop - Sim.mitigatePhysical(11, 30)) < 0.01, "tower drop " + towerDrop);
});

test("elastic launch fizzles when its mana was spent during the charge", function () {
  const T = loadGame();
  parkHero(T, 750, 750);
  T.hero.mana = 100; // enough for either cast, not both (60 + 60)
  T.startCharge();
  T.castAbility("oozeBurst"); // spends 60 mid-charge, leaving 40
  assert.equal(T.hero.mana, 40);
  T.state.mouse.x = 1050;
  T.state.mouse.y = 750;
  T.releaseLaunch();
  assert.equal(T.hero.mana, 40); // never negative
  assert.equal(T.hero.flight, null); // no free flight
  assert.equal(T.hero.cooldowns.elasticLaunch, 0); // no cooldown either
});

test("elastic launch still fires when the mana is there", function () {
  const T = loadGame();
  parkHero(T, 750, 750);
  T.state.mouse.x = 1050;
  T.state.mouse.y = 750;
  T.startCharge();
  T.releaseLaunch();
  assert.notEqual(T.hero.flight, null);
  assert.equal(T.hero.mana, T.hero.maxMana - Sim.ABILITIES.elasticLaunch.manaCost);
});

test("lethal damage during elastic launch flight kills before landing", function () {
  const T = loadGame();
  parkHero(T, 750, 750);
  T.hero.passiveReadyAt = Infinity; // passive spent: death is real
  const bystander = meleeMinion(T, 1050, 750);
  bystander.rootUntil = Infinity; // rooted: stays at the landing point
  T.state.minions.push(bystander);
  T.state.mouse.x = 1050;
  T.state.mouse.y = 750;
  T.startCharge();
  T.releaseLaunch();
  assert.notEqual(T.hero.flight, null);
  T.hero.hp = -10; // lethal damage taken mid-flight
  step(T, 0.05);
  assert.equal(T.hero.dead, true);
  assert.equal(T.hero.flight, null);
  step(T, 1);
  assert.equal(bystander.hp, bystander.maxHp); // no landing damage, no auto-attack
});

test("death clears the move target, so respawn does not walk it back", function () {
  const T = loadGame();
  parkHero(T, 750, 750);
  T.hero.passiveReadyAt = Infinity;
  T.state.moveTarget = { x: 200, y: 200 };
  T.hero.hp = -5;
  step(T, 0.05);
  assert.equal(T.hero.dead, true);
  assert.equal(T.state.moveTarget, null);
  let guard = 0;
  while (T.hero.dead && guard < 400) { step(T, 0.05); guard += 1; }
  assert.equal(T.hero.dead, false);
  const rx = T.hero.x;
  const ry = T.hero.y;
  step(T, 2);
  const moved = Math.sqrt((T.hero.x - rx) * (T.hero.x - rx) + (T.hero.y - ry) * (T.hero.y - ry));
  assert.ok(moved < 1, "hero walked " + moved + " units after respawn");
});

test("cooldowns and chunk expiry keep ticking while dead", function () {
  const T = loadGame();
  parkHero(T, 750, 750);
  T.hero.passiveReadyAt = Infinity;
  T.hero.cooldowns.oozeBurst = 8;
  T.state.chunks.push({ x: 100, y: 100, expiresAt: T.state.time + 2 });
  T.hero.hp = -5;
  step(T, 0.05); // dies on this frame
  assert.equal(T.hero.dead, true);
  step(T, 3);
  assert.ok(Math.abs(T.hero.cooldowns.oozeBurst - 4.95) < 0.01, "cooldown " + T.hero.cooldowns.oozeBurst);
  assert.equal(T.state.chunks.length, 0); // expired on schedule, not frozen
});

test("cooldowns keep ticking during elastic launch flight", function () {
  const T = loadGame();
  parkHero(T, 750, 750);
  T.hero.cooldowns.oozeBurst = 8;
  T.state.mouse.x = 1050;
  T.state.mouse.y = 750;
  T.startCharge();
  T.releaseLaunch();
  step(T, 0.3); // mid-flight
  assert.notEqual(T.hero.flight, null);
  assert.ok(Math.abs(T.hero.cooldowns.oozeBurst - 7.7) < 0.01, "cooldown " + T.hero.cooldowns.oozeBurst);
});

test("boing barrage casts normally at level 6", function () {
  const T = loadGame();
  parkHero(T, 750, 750);
  T.hero.level = 6;
  T.castAbility("boingBarrage");
  assert.notEqual(T.hero.bounce, null);
  assert.equal(T.hero.mana, T.hero.maxMana - Sim.ABILITIES.boingBarrage.manaCost);
  assert.equal(T.hero.cooldowns.boingBarrage, Sim.ABILITIES.boingBarrage.cooldown);
});
