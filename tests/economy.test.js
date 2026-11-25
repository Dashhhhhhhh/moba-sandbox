"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Sim = require("../src/sim.js");

test("last-hit gold values by minion kind", function () {
  assert.equal(Sim.LAST_HIT_GOLD.melee, 21);
  assert.equal(Sim.LAST_HIT_GOLD.caster, 17);
  assert.equal(Sim.LAST_HIT_GOLD.siege, 35);
  assert.ok(Sim.LAST_HIT_GOLD.siege > Sim.LAST_HIT_GOLD.melee);
  assert.ok(Sim.SHARED_GOLD < Sim.LAST_HIT_GOLD.caster);
});

test("xp curve: level 1 needs 0, level 2 needs 180 cumulative", function () {
  assert.equal(Sim.cumulativeXpForLevel(1), 0);
  assert.equal(Sim.xpToNextLevel(1), 180);
  assert.equal(Sim.cumulativeXpForLevel(2), 180);
  assert.equal(Sim.cumulativeXpForLevel(3), 180 + 270);
});

test("levelFromXp finds the right level at boundaries", function () {
  assert.equal(Sim.levelFromXp(0), 1);
  assert.equal(Sim.levelFromXp(179), 1);
  assert.equal(Sim.levelFromXp(180), 2);
  assert.equal(Sim.levelFromXp(449), 2);
  assert.equal(Sim.levelFromXp(450), 3);
});

test("levelFromXp and cumulativeXpForLevel agree at every level", function () {
  for (let level = 1; level <= 18; level += 1) {
    assert.equal(Sim.levelFromXp(Sim.cumulativeXpForLevel(level)), level);
    if (level > 1) {
      assert.equal(Sim.levelFromXp(Sim.cumulativeXpForLevel(level) - 1), level - 1);
    }
  }
});

test("splitXp divides evenly, floors, and handles zero allies", function () {
  assert.equal(Sim.splitXp(60, 1), 60);
  assert.equal(Sim.splitXp(60, 2), 30);
  assert.equal(Sim.splitXp(61, 2), 30);
  assert.equal(Sim.splitXp(60, 0), 0);
});
