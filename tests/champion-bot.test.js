"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Sim = require("../src/sim.js");

function bot(overrides) {
  return Object.assign({
    x: 0,
    y: 0,
    hp: 680,
    maxHp: 680,
    retreating: false,
  }, overrides);
}

test("the champion bot retreats at low health and waits to recover before returning", function () {
  const retreating = Sim.selectChampionBotObjective(
    bot({ hp: 238 }),
    []
  );
  assert.deepEqual(retreating, { type: "retreat" });

  const stillRetreating = Sim.selectChampionBotObjective(
    bot({ hp: 500, retreating: true }),
    []
  );
  assert.deepEqual(stillRetreating, { type: "retreat" });

  const resumed = Sim.selectChampionBotObjective(
    bot({ hp: 544, retreating: true }),
    []
  );
  assert.deepEqual(resumed, { type: "lane" });
});

test("the champion bot clears the nearest available camp within seek range", function () {
  const nearby = { x: 180, y: 0, available: true };
  const farther = { x: 220, y: 0, available: true };
  const objective = Sim.selectChampionBotObjective(bot(), [
    farther,
    { x: 10, y: 0, available: false },
    nearby,
  ]);
  assert.deepEqual(objective, { type: "camp", target: nearby });
});

test("the champion bot lanes when no available camp is close enough", function () {
  const objective = Sim.selectChampionBotObjective(bot(), [
    { x: Sim.CHAMPION_BOT.campSeekRange + 1, y: 0, available: true },
    { x: 10, y: 0, available: false },
  ]);
  assert.deepEqual(objective, { type: "lane" });
});
