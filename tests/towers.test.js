"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Sim = require("../src/sim.js");

const TOWER_AT_ORIGIN = { id: "blue-mid", x: 0, y: 0 };

function minion(x, y, hp) {
  return { kind: "minion", x: x, y: y, hp: hp === undefined ? 300 : hp, radius: 13, aggro: null };
}

function champion(x, y, aggro) {
  return { kind: "champion", x: x, y: y, hp: 800, radius: 20, aggro: aggro || null };
}

test("tower shot damage is mitigated by armor", function () {
  assert.equal(Sim.towerShotDamage(0), Sim.TOWER.damage);
  assert.equal(Sim.towerShotDamage(100), Sim.TOWER.damage / 2);
  assert.ok(Sim.towerShotDamage(-50) > Sim.TOWER.damage);
});

test("tower with nothing in range has no target", function () {
  assert.equal(Sim.selectTowerTarget(TOWER_AT_ORIGIN, [], 0), null);
  assert.equal(Sim.selectTowerTarget(TOWER_AT_ORIGIN, [minion(1000, 0)], 0), null);
  // Dead units are never targeted.
  assert.equal(Sim.selectTowerTarget(TOWER_AT_ORIGIN, [minion(50, 0, 0)], 0), null);
});

test("tower shoots the nearest enemy minion first", function () {
  const far = minion(200, 0);
  const near = minion(90, 0);
  const champ = champion(120, 0);
  assert.equal(Sim.selectTowerTarget(TOWER_AT_ORIGIN, [far, champ, near], 0), near);
});

test("tower falls back to a champion when no minion is in range", function () {
  const champ = champion(150, 0);
  assert.equal(Sim.selectTowerTarget(TOWER_AT_ORIGIN, [champ], 0), champ);
});

test("a champion who damaged an allied champion under the tower takes aggro", function () {
  const m = minion(60, 0); // a minion is closer, and still loses
  const champ = champion(220, 0, { towerId: "blue-mid", at: 10 });
  assert.equal(Sim.selectTowerTarget(TOWER_AT_ORIGIN, [m, champ], 11), champ);
});

test("aggro on a different tower does not pull this tower", function () {
  const m = minion(60, 0);
  const champ = champion(220, 0, { towerId: "red-mid", at: 10 });
  assert.equal(Sim.selectTowerTarget(TOWER_AT_ORIGIN, [m, champ], 11), m);
});

test("aggro expires after the window", function () {
  const m = minion(60, 0);
  const champ = champion(220, 0, { towerId: "blue-mid", at: 10 });
  const later = 10 + Sim.TOWER_AGGRO_WINDOW + 0.1;
  assert.equal(Sim.selectTowerTarget(TOWER_AT_ORIGIN, [m, champ], later), m);
});

test("an out-of-range aggro champion is not shot", function () {
  const m = minion(60, 0);
  const champ = champion(900, 0, { towerId: "blue-mid", at: 10 });
  assert.equal(Sim.selectTowerTarget(TOWER_AT_ORIGIN, [m, champ], 11), m);
});
