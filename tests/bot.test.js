"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Sim = require("../src/sim.js");

test("champion bot retreats at low health and waits to recover before returning", function () {
  assert.equal(Sim.shouldBotRetreat(false, 3, 10), true);
  assert.equal(Sim.shouldBotRetreat(true, 7.4, 10), true);
  assert.equal(Sim.shouldBotRetreat(true, 7.5, 10), false);
  assert.equal(Sim.shouldBotRetreat(false, 3.1, 10), false);
});
