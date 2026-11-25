"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Harness = require("../tools/balance-harness.js");

test("the all-scenario report is deterministic and includes lane and camp results", function () {
  const options = { scenario: "all", maxSeconds: 180 };
  const first = Harness.runBalanceReport(options);
  const second = Harness.runBalanceReport(options);

  assert.deepEqual(first, second);
  assert.equal(first.stepSeconds, 0.1);
  assert.equal(first.lane.bots.length, 2);
  assert.equal(first.lane.winner, "draw");
  assert.deepEqual(first.camps.map(function (camp) { return camp.kind; }), [
    "buff",
    "wolves",
    "golems",
    "thornbacks",
  ]);
  first.camps.forEach(function (camp) {
    assert.equal(camp.cleared, true);
    assert.ok(camp.durationSeconds > 0);
    assert.ok(camp.botHpRemaining > 0);
    assert.ok(camp.gold > 0);
    assert.ok(camp.xp > 0);
  });
});

test("scenario selection omits runs that were not requested", function () {
  const laneReport = Harness.runBalanceReport({ scenario: "lane", maxSeconds: 1 });
  const campReport = Harness.runBalanceReport({ scenario: "camp", maxSeconds: 1 });

  assert.equal("camps" in laneReport, false);
  assert.equal("lane" in campReport, false);
  assert.equal(laneReport.lane.timedOut, true);
  assert.equal(campReport.camps.every(function (camp) { return camp.timedOut; }), true);
});

test("invalid scenario and unbounded durations are rejected", function () {
  assert.throws(function () {
    Harness.runBalanceReport({ scenario: "towers" });
  }, /scenario must be lane, camp, or all/);
  assert.throws(function () {
    Harness.runBalanceReport({ maxSeconds: 1801 });
  }, /maxSeconds must be an integer/);
  assert.throws(function () {
    Harness.runBalanceReport({ maxSeconds: 1.5 });
  }, /maxSeconds must be an integer/);
});
