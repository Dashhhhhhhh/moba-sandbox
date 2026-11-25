"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Sim = require("../src/sim.js");

test("epic bosses have distinct melee and ranged combat profiles", function () {
  assert.equal(Sim.EPIC_BOSS_STATS.gorehorn.damageType, "physical");
  assert.equal(Sim.EPIC_BOSS_STATS.gorehorn.range, 100);
  assert.equal(Sim.EPIC_BOSS_STATS.vessikar.damageType, "magic");
  assert.equal(Sim.EPIC_BOSS_STATS.vessikar.range, 300);
  assert.equal(Object.isFrozen(Sim.EPIC_BOSS_STATS.gorehorn), true);
  assert.equal(Object.isFrozen(Sim.EPIC_BOSS_STATS.vessikar), true);
});

test("epic rewards grant each champion team gold, XP, and a timed boss-specific buff", function () {
  assert.deepEqual(Sim.epicBossReward("gorehorn", "blue", 120), {
    team: "blue",
    goldPerChampion: 150,
    xpPerChampion: 240,
    buff: {
      name: "Hollow Might",
      expiresAt: 210,
      attackDamageBonus: 12,
      healthRegenPerSecond: 0,
    },
  });
  assert.deepEqual(Sim.epicBossReward("vessikar", "red", 30).buff, {
    name: "Tide's Renewal",
    expiresAt: 120,
    attackDamageBonus: 0,
    healthRegenPerSecond: 6,
  });
});

test("epic objectives respawn exactly 360 seconds after being cleared", function () {
  const objective = Sim.createCamp("epic");
  Sim.clearCamp(objective, 120);
  assert.equal(objective.respawnAt, 480);
  assert.equal(Sim.isCampAlive(objective, 479), false);
  assert.equal(Sim.updateCamp(objective, 480), true);
  assert.equal(Sim.updateCamp(objective, 481), false);
});

test("epic rewards reject unknown bosses and teams", function () {
  assert.throws(function () {
    Sim.epicBossReward("unknown", "blue", 0);
  }, /unknown epic boss/);
  assert.throws(function () {
    Sim.epicBossReward("gorehorn", "green", 0);
  }, /unknown team/);
});
