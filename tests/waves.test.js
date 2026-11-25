"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Sim = require("../src/sim.js");

const LANES = {
  top: [{ x: 0, y: 0 }, { x: 0, y: 10 }],
  mid: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
  bot: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
};

test("minion wave groups cover both teams on every lane", function () {
  const groups = Sim.minionWaveGroups(LANES, 1);

  assert.deepEqual(groups.map(function (group) {
    return [group.lane, group.team];
  }), [
    ["top", "blue"],
    ["top", "red"],
    ["mid", "blue"],
    ["mid", "red"],
    ["bot", "blue"],
    ["bot", "red"],
  ]);
  groups.forEach(function (group) {
    assert.equal(group.kinds.length, 6);
    assert.equal(group.kinds.filter(function (kind) {
      return kind === "melee";
    }).length, 3);
    assert.equal(group.kinds.filter(function (kind) {
      return kind === "caster";
    }).length, 3);
  });
});

test("red minion groups follow each lane in reverse", function () {
  const groups = Sim.minionWaveGroups(LANES, 1);

  Object.keys(LANES).forEach(function (lane) {
    const red = groups.find(function (group) {
      return group.lane === lane && group.team === "red";
    });
    assert.deepEqual(red.path, LANES[lane].slice().reverse());
  });
  assert.deepEqual(LANES.top, [{ x: 0, y: 0 }, { x: 0, y: 10 }]);
});

test("siege minions appear on every lane every third wave", function () {
  const groups = Sim.minionWaveGroups(LANES, 3);

  assert.equal(groups.length, 6);
  groups.forEach(function (group) {
    assert.equal(group.kinds.length, 7);
    assert.equal(group.kinds[6], "siege");
  });
});
