"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Sim = require("../src/sim.js");

test("structures start with their configured health and defenses", function () {
  const wardstone = Sim.createStructure("wardstone", "red", "mid");
  const heartspire = Sim.createStructure("heartspire", "red");

  assert.equal(wardstone.maxHp, Sim.WARDSTONE.maxHp);
  assert.equal(wardstone.hp, Sim.WARDSTONE.maxHp);
  assert.equal(wardstone.armor, Sim.WARDSTONE.armor);
  assert.equal(wardstone.lane, "mid");
  assert.equal(heartspire.maxHp, Sim.HEARTSPIRE.maxHp);
  assert.equal(heartspire.lane, null);
});

test("structure damage mitigates physical attacks and clamps health at zero", function () {
  const wardstone = Sim.createStructure("wardstone", "red", "top");

  assert.equal(Sim.damageStructure(wardstone, 100), false);
  assert.equal(wardstone.hp, wardstone.maxHp - Sim.mitigatePhysical(100, wardstone.armor));
  assert.equal(Sim.damageStructure(wardstone, 100000), true);
  assert.equal(wardstone.hp, 0);
});

test("a Wardstone requires its own lane tower to be destroyed", function () {
  const wardstone = Sim.createStructure("wardstone", "red", "mid");
  const towers = [
    { team: "red", lane: "top", hp: 0 },
    { team: "red", lane: "mid", hp: 100 },
  ];

  assert.equal(Sim.isStructureVulnerable(wardstone, towers, []), false);
  towers[1].hp = 0;
  assert.equal(Sim.isStructureVulnerable(wardstone, towers, []), true);
});

test("any destroyed Wardstone exposes only its team's Heartspire", function () {
  const redHeartspire = Sim.createStructure("heartspire", "red");
  const blueHeartspire = Sim.createStructure("heartspire", "blue");
  const wardstones = [
    { team: "red", hp: 0 },
    { team: "blue", hp: 100 },
  ];

  assert.equal(Sim.isStructureVulnerable(redHeartspire, [], wardstones), true);
  assert.equal(Sim.isStructureVulnerable(blueHeartspire, [], wardstones), false);
});

test("unknown structure kinds are rejected", function () {
  assert.throws(function () {
    Sim.createStructure("unknown", "red");
  }, /unknown structure/);
});
