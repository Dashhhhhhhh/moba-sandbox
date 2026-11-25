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

test("stretch grab slam scales with ability power, not attack damage", function () {
  // 60 base + 0.6 * 100 AP = 120, AD ignored.
  assert.equal(Sim.abilityRawDamage("stretchGrab", 1, 500, 100), 120);
  // Rank 5: 200 base + 0.6 * 100 = 260.
  assert.equal(Sim.abilityRawDamage("stretchGrab", 5, 0, 100), 260);
});

test("abilityDamage applies the matching mitigation", function () {
  const target = { armor: 0, magicResist: 100, maxHp: 0 };
  // Magic: raw 120 vs 100 resist = 60.
  assert.equal(Sim.abilityDamage("stretchGrab", 1, 0, 100, target), 60);
});

test("ooze burst deals a percentage of the target's max health", function () {
  // Rank 1: 5% of max HP. A 1000 HP target takes 50 from the ratio alone.
  assert.equal(Sim.abilityMaxHpDamage("oozeBurst", 1, 1000), 50);
  // Rank 5: 9% of max HP.
  assert.equal(Sim.abilityMaxHpDamage("oozeBurst", 5, 1000), 90);
  // Abilities without a maxHpRatio deal none.
  assert.equal(Sim.abilityMaxHpDamage("stretchGrab", 1, 1000), 0);
  // Full pipeline vs 0 resist: 50 base + 50 from max HP = 100.
  const squishy = { armor: 0, magicResist: 0, maxHp: 1000 };
  assert.equal(Sim.abilityDamage("oozeBurst", 1, 0, 0, squishy), 100);
  // The max-health part is mitigated too: vs 100 resist it halves.
  const tank = { armor: 0, magicResist: 100, maxHp: 1000 };
  assert.equal(Sim.abilityDamage("oozeBurst", 1, 0, 0, tank), 50);
});

test("elastic launch range grows with charge time and clamps", function () {
  const def = Sim.ABILITIES.elasticLaunch;
  assert.equal(Sim.launchRange(0), def.minRange);
  assert.equal(Sim.launchRange(def.maxChargeSeconds / 2), (def.minRange + def.maxRange) / 2);
  assert.equal(Sim.launchRange(def.maxChargeSeconds), def.maxRange);
  assert.equal(Sim.launchRange(99), def.maxRange);
});

test("boing barrage bounces exactly four times", function () {
  assert.equal(Sim.ABILITIES.boingBarrage.bounces, 4);
  // Per-bounce rank 1 damage vs 0 resist is the 120 base; four bounces
  // against a dummy total 480 before any other effects.
  const dummy = { armor: 0, magicResist: 0, maxHp: 10000 };
  const perBounce = Sim.abilityDamage("boingBarrage", 1, 0, 0, dummy);
  assert.equal(perBounce * Sim.ABILITIES.boingBarrage.bounces, 480);
});

test("rank is clamped to the ability's defined ranks", function () {
  // Boing Barrage has 3 ranks; asking for rank 9 uses rank 3 values.
  assert.equal(
    Sim.abilityRawDamage("boingBarrage", 9, 0, 0),
    Sim.abilityRawDamage("boingBarrage", 3, 0, 0)
  );
});

test("loose gel chunks heal a fraction of max health", function () {
  assert.equal(Sim.chunkHealAmount(1000), 60); // 6% of 1000
  assert.equal(Sim.chunkHealAmount(680), 40.8);
});

test("bloblet revive needs a survivor and the full merge time", function () {
  assert.equal(Sim.shouldRevive(1, Sim.PASSIVE.blobletReviveSeconds), true);
  assert.equal(Sim.shouldRevive(4, Sim.PASSIVE.blobletReviveSeconds + 2), true);
  assert.equal(Sim.shouldRevive(0, 60), false);
  assert.equal(Sim.shouldRevive(2, Sim.PASSIVE.blobletReviveSeconds - 0.1), false);
});

test("revive health scales with surviving bloblets", function () {
  // 10% base plus 5% per survivor, of 1000 max HP.
  assert.ok(Math.abs(Sim.blobletReviveHp(1000, 1) - 150) < 0.001);
  assert.ok(Math.abs(Sim.blobletReviveHp(1000, 4) - 300) < 0.001);
  assert.equal(Sim.blobletReviveHp(1000, 0), 0);
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
