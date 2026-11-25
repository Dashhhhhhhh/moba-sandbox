"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Sim = require("../src/sim.js");

test("armor mitigation follows the 100/(100+armor) curve", function () {
  assert.equal(Sim.mitigatePhysical(100, 0), 100);
  assert.equal(Sim.mitigatePhysical(100, 100), 50);
  assert.ok(Math.abs(Sim.mitigatePhysical(100, 50) - 66.6667) < 0.001);
});

test("negative armor amplifies damage", function () {
  assert.ok(Sim.mitigatePhysical(100, -50) > 100);
});

test("briar lash rank 1 raw damage is base plus AD ratio", function () {
  // 70 base + 0.7 * 100 bonus AD = 140.
  assert.equal(Sim.abilityRawDamage("briarLash", 1, 100, 0), 140);
  // Rank 5: 210 base + 0.7 * 100 = 280.
  assert.equal(Sim.abilityRawDamage("briarLash", 5, 100, 0), 280);
});

test("root snare scales with ability power, not attack damage", function () {
  // 60 base + 0.6 * 100 AP = 120, AD ignored.
  assert.equal(Sim.abilityRawDamage("rootSnare", 1, 500, 100), 120);
});

test("abilityDamage applies the matching mitigation", function () {
  const target = { armor: 100, magicResist: 0 };
  // Physical: raw 140 vs 100 armor = 70.
  assert.equal(Sim.abilityDamage("briarLash", 1, 100, 0, target), 70);
  // Magic: raw 120 vs 0 resist = 120.
  assert.equal(Sim.abilityDamage("rootSnare", 1, 0, 100, target), 120);
});

test("rank is clamped to the ability's defined ranks", function () {
  // Verdant Cataclysm has 3 ranks; asking for rank 9 uses rank 3 values.
  assert.equal(
    Sim.abilityRawDamage("verdantCataclysm", 9, 0, 0),
    Sim.abilityRawDamage("verdantCataclysm", 3, 0, 0)
  );
});

test("unknown ability throws", function () {
  assert.throws(function () {
    Sim.abilityRawDamage("notAnAbility", 1, 0, 0);
  });
});

test("reap damage grows with level and execute threshold matches it", function () {
  assert.equal(Sim.reapDamage(1), 450);
  assert.equal(Sim.reapDamage(6), 650);
  assert.equal(Sim.reapExecutes(650, 6), true);
  assert.equal(Sim.reapExecutes(651, 6), false);
});
