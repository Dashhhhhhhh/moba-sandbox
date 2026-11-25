"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Sim = require("../src/sim.js");

test("champion definitions expose Bloop's original base stats", function () {
  const definition = Sim.getChampionDefinition("bloop");
  assert.equal(definition.displayName, "Bloop, the Bounceback Blob");
  assert.deepEqual(definition.baseStats, {
    maxHp: 680,
    maxMana: 300,
    baseAd: 62,
    armor: 32,
    magicResist: 32,
    moveSpeed: 335,
    attackRange: 150,
    attackPeriod: 0.9,
  });
});

test("champion definitions return independent base-stat objects", function () {
  const first = Sim.getChampionDefinition("bloop");
  first.baseStats.maxHp = 1;
  assert.equal(Sim.getChampionDefinition("bloop").baseStats.maxHp, 680);
});

test("unknown champion definitions throw", function () {
  assert.throws(function () {
    Sim.getChampionDefinition("unknown");
  }, /unknown champion/);
  assert.throws(function () {
    Sim.getChampionDefinition("toString");
  }, /unknown champion/);
});

test("minion combat stats are available from the simulation catalog", function () {
  assert.deepEqual(Sim.MINION_STATS, {
    melee: { hp: 480, damage: 11, range: 105, radius: 13, speed: 105, armor: 0, magicResist: 0 },
    caster: { hp: 290, damage: 16, range: 280, radius: 12, speed: 105, armor: 0, magicResist: 0 },
    siege: { hp: 850, damage: 22, range: 120, radius: 17, speed: 95, armor: 0, magicResist: 0 },
  });
  assert.equal(Object.isFrozen(Sim.MINION_STATS.melee), true);
});

test("camp balance stats distinguish original camp profiles", function () {
  assert.deepEqual(Sim.CAMP_STATS.buff, {
    kind: "buff",
    monsters: 1,
    monsterHp: 950,
    monsterDamage: 22,
    monsterRadius: 24,
    gold: 90,
    xp: 120,
  });
  assert.deepEqual(Sim.CAMP_STATS.wolves, {
    kind: "small",
    monsters: 2,
    monsterHp: 520,
    monsterDamage: 11,
    monsterRadius: 17,
    gold: 70,
    xp: 95,
  });
  assert.deepEqual(Sim.CAMP_STATS.golems, {
    kind: "small",
    monsters: 2,
    monsterHp: 640,
    monsterDamage: 13,
    monsterRadius: 17,
    gold: 75,
    xp: 100,
  });
  assert.deepEqual(Sim.CAMP_STATS.thornbacks, {
    kind: "small",
    monsters: 2,
    monsterHp: 480,
    monsterDamage: 12,
    monsterRadius: 17,
    gold: 65,
    xp: 90,
  });
  assert.equal(Object.isFrozen(Sim.CAMP_STATS.buff), true);
});
