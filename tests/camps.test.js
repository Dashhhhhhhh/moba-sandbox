"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Sim = require("../src/sim.js");

test("a fresh camp is alive at any time", function () {
  const camp = Sim.createCamp("small");
  assert.equal(Sim.isCampAlive(camp, 0), true);
  assert.equal(Sim.isCampAlive(camp, 9999), true);
  assert.equal(Sim.campRespawnRemaining(camp, 100), 0);
});

test("a small camp respawns exactly 150 seconds after being cleared", function () {
  const camp = Sim.createCamp("small");
  Sim.clearCamp(camp, 200);
  assert.equal(camp.respawnAt, 350);
  assert.equal(Sim.isCampAlive(camp, 349), false);
  assert.equal(Sim.isCampAlive(camp, 350), true);
  assert.equal(Sim.campRespawnRemaining(camp, 320), 30);
});

test("a buff camp respawns exactly 300 seconds after being cleared", function () {
  const camp = Sim.createCamp("buff");
  Sim.clearCamp(camp, 75);
  assert.equal(camp.respawnAt, 375);
  assert.equal(Sim.isCampAlive(camp, 374), false);
  assert.equal(Sim.isCampAlive(camp, 375), true);
});

test("updateCamp revives a camp once and reports it", function () {
  const camp = Sim.createCamp("small");
  Sim.clearCamp(camp, 0);
  assert.equal(Sim.updateCamp(camp, 149), false);
  assert.equal(camp.alive, false);
  assert.equal(Sim.updateCamp(camp, 150), true);
  assert.equal(camp.alive, true);
  assert.equal(camp.clearedAt, null);
  assert.equal(camp.respawnAt, null);
  // A second call does not report another respawn.
  assert.equal(Sim.updateCamp(camp, 200), false);
});

test("a camp can be cleared again after respawning", function () {
  const camp = Sim.createCamp("buff");
  Sim.clearCamp(camp, 0);
  Sim.updateCamp(camp, 300);
  Sim.clearCamp(camp, 500);
  assert.equal(camp.respawnAt, 800);
  assert.equal(Sim.campRespawnRemaining(camp, 650), 150);
});

test("Ember Sigil grants a timed basic attack damage bonus", function () {
  const expiresAt = Sim.applyEmberSigil(75);
  assert.equal(expiresAt, 135);
  assert.equal(Sim.emberSigilRemaining(expiresAt, 90), 45);
  assert.ok(Math.abs(Sim.emberSigilAttackDamage(100, expiresAt, 90) - 112) < 1e-9);
  assert.equal(Sim.emberSigilRemaining(expiresAt, 135), 0);
  assert.equal(Sim.emberSigilAttackDamage(100, expiresAt, 135), 100);
});

test("re-clearing a buff camp refreshes rather than stacks Ember Sigil", function () {
  const firstExpiry = Sim.applyEmberSigil(10);
  const refreshedExpiry = Sim.applyEmberSigil(40);
  assert.equal(firstExpiry, 70);
  assert.equal(refreshedExpiry, 100);
  assert.ok(Math.abs(Sim.emberSigilAttackDamage(100, refreshedExpiry, 80) - 112) < 1e-9);
});
