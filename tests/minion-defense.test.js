"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Sim = require("../src/sim.js");

test("mitigation treats a missing defense stat as zero, never NaN", function () {
  assert.equal(Sim.mitigatePhysical(50, undefined), 50);
  assert.equal(Sim.mitigateMagic(50, undefined), 50);
});

test("ability damage against a target with no defense stats is finite", function () {
  // Regression test for the QA finding filed on the coordination issue:
  // minions were created with no armor or magicResist, one Ooze Burst set
  // a minion's hp to NaN, and the game read that as a kill and paid out
  // full last-hit gold and XP for it.
  const minionShaped = { maxHp: 480, hp: 480 };
  const damage = Sim.abilityDamage("oozeBurst", 1, 0, 0, minionShaped);
  assert.ok(Number.isFinite(damage));
  assert.ok(damage > 0);
});

test("every minion stat block defines armor and magicResist", function () {
  for (const kind of Object.keys(Sim.MINION_STATS)) {
    const stats = Sim.MINION_STATS[kind];
    assert.equal(typeof stats.armor, "number", kind + " armor");
    assert.equal(typeof stats.magicResist, "number", kind + " magicResist");
  }
});
