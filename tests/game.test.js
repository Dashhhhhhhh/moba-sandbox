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

test("boing barrage casts normally at level 6", function () {
  const T = loadGame();
  parkHero(T, 750, 750);
  T.hero.level = 6;
  T.castAbility("boingBarrage");
  assert.notEqual(T.hero.bounce, null);
  assert.equal(T.hero.mana, T.hero.maxMana - Sim.ABILITIES.boingBarrage.manaCost);
  assert.equal(T.hero.cooldowns.boingBarrage, Sim.ABILITIES.boingBarrage.cooldown);
});
