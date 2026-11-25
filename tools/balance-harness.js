"use strict";

const Sim = require("../src/sim.js");

const STEP_SECONDS = 0.1;
const DEFAULT_MAX_SECONDS = 180;
const MAX_SECONDS_LIMIT = 1800;
const CAMP_KINDS = ["buff", "wolves", "golems", "thornbacks"];

function assertMaxSeconds(maxSeconds) {
  if (!Number.isInteger(maxSeconds) || maxSeconds < 1 || maxSeconds > MAX_SECONDS_LIMIT) {
    throw new Error("maxSeconds must be an integer from 1 to " + MAX_SECONDS_LIMIT);
  }
}

function championFor(team) {
  const definition = Sim.getChampionDefinition("bloop");
  return {
    team: team,
    hp: definition.baseStats.maxHp,
    maxHp: definition.baseStats.maxHp,
    damage: definition.baseStats.baseAd,
    armor: definition.baseStats.armor,
    attackRange: definition.baseStats.attackRange,
    attackPeriod: definition.baseStats.attackPeriod,
    attackCooldown: 0,
    radius: 24,
    minionKills: 0,
  };
}

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function nearestTarget(attacker, candidates, range) {
  let best = null;
  let bestDistance = Infinity;
  candidates.forEach(function (candidate) {
    if (candidate.hp <= 0) return;
    const candidateRange = range + candidate.radius;
    const candidateDistance = distance(attacker, candidate);
    if (candidateDistance <= candidateRange && candidateDistance < bestDistance) {
      best = candidate;
      bestDistance = candidateDistance;
    }
  });
  return best;
}

function physicalDamage(target, damage) {
  const armor = typeof target.armor === "number" ? target.armor : 0;
  return Sim.mitigatePhysical(damage, armor);
}

function createLaneMinions() {
  const groups = Sim.minionWaveGroups({ mid: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }, 1);
  const minions = [];
  groups.forEach(function (group) {
    const teamOffset = group.team === "blue" ? -25 : 25;
    group.kinds.forEach(function (kind, index) {
      const stats = Sim.MINION_STATS[kind];
      minions.push({
        team: group.team,
        kind: kind,
        x: teamOffset,
        y: (index - (group.kinds.length - 1) / 2) * 22,
        hp: stats.hp,
        damage: stats.damage,
        range: stats.range,
        radius: stats.radius,
        armor: stats.armor,
        attackPeriod: 1.1,
        attackCooldown: 0,
      });
    });
  });
  return minions;
}

function simulateLane(maxSeconds) {
  const bots = [championFor("blue"), championFor("red")];
  bots[0].x = -80;
  bots[0].y = 0;
  bots[1].x = 80;
  bots[1].y = 0;
  const minions = createLaneMinions();
  const maxTicks = Math.ceil(maxSeconds / STEP_SECONDS);
  let ticks = 0;

  while (ticks < maxTicks) {
    ticks += 1;
    const units = minions.concat(bots);
    units.forEach(function (unit) {
      if (unit.hp <= 0) return;
      unit.attackCooldown = Math.max(0, unit.attackCooldown - STEP_SECONDS);
    });

    const attacks = [];
    units.forEach(function (unit) {
      if (unit.hp <= 0 || unit.attackCooldown > 0) return;
      const enemies = units.filter(function (candidate) {
        return candidate.team !== unit.team && candidate.hp > 0;
      });
      let target;
      if (unit.kind) {
        target = nearestTarget(unit, enemies.filter(function (candidate) {
          return candidate.kind;
        }), unit.range);
        if (!target) {
          target = nearestTarget(unit, enemies.filter(function (candidate) {
            return !candidate.kind;
          }), unit.range);
        }
      } else {
        target = nearestTarget(unit, enemies.filter(function (candidate) {
          return candidate.kind;
        }), unit.attackRange);
        if (!target) {
          target = nearestTarget(unit, enemies.filter(function (candidate) {
            return !candidate.kind;
          }), unit.attackRange);
        }
      }
      if (target) {
        unit.attackCooldown = unit.attackPeriod;
        attacks.push({
          attacker: unit,
          target: target,
          damage: physicalDamage(target, unit.damage),
        });
      }
    });
    const damageByTarget = new Map();
    attacks.forEach(function (attack) {
      if (!damageByTarget.has(attack.target)) damageByTarget.set(attack.target, []);
      damageByTarget.get(attack.target).push(attack);
    });
    damageByTarget.forEach(function (targetAttacks, target) {
      const hpBefore = target.hp;
      const totalDamage = targetAttacks.reduce(function (total, attack) {
        return total + attack.damage;
      }, 0);
      target.hp = Math.max(0, hpBefore - totalDamage);
      if (target.hp === 0 && target.kind) {
        let dealt = 0;
        targetAttacks.some(function (attack) {
          dealt += attack.damage;
          if (dealt >= hpBefore && typeof attack.attacker.minionKills === "number") {
            attack.attacker.minionKills += 1;
            return true;
          }
          return false;
        });
      }
    });

    if (bots.some(function (bot) { return bot.hp <= 0; })) break;
    if (units.every(function (unit) { return unit.hp <= 0; })) break;
  }

  const aliveBots = bots.filter(function (bot) { return bot.hp > 0; });
  return {
    durationSeconds: Number((ticks * STEP_SECONDS).toFixed(1)),
    timedOut: ticks === maxTicks && aliveBots.length > 0,
    winner: aliveBots.length === 1 ? aliveBots[0].team : aliveBots.length === 0 ? "draw" : null,
    bots: bots.map(function (bot) {
      return {
        team: bot.team,
        hpRemaining: Number(bot.hp.toFixed(1)),
        minionKills: bot.minionKills,
      };
    }),
    minionsRemaining: {
      blue: minions.filter(function (minion) { return minion.team === "blue" && minion.hp > 0; }).length,
      red: minions.filter(function (minion) { return minion.team === "red" && minion.hp > 0; }).length,
    },
  };
}

function simulateCamp(kind, maxSeconds) {
  const stats = Sim.CAMP_STATS[kind];
  if (!stats) throw new Error("unknown camp kind: " + kind);

  const champion = championFor("blue");
  const monsters = Array.from({ length: stats.monsters }, function () {
    return {
      hp: stats.monsterHp,
      maxHp: stats.monsterHp,
      damage: stats.monsterDamage,
      radius: stats.monsterRadius,
      x: 0,
      y: 0,
      attackCooldown: 0,
    };
  });
  let reapCooldown = 0;
  let reapCasts = 0;
  const maxTicks = Math.ceil(maxSeconds / STEP_SECONDS);
  let ticks = 0;

  while (ticks < maxTicks && champion.hp > 0 && monsters.some(function (monster) { return monster.hp > 0; })) {
    ticks += 1;
    champion.attackCooldown = Math.max(0, champion.attackCooldown - STEP_SECONDS);
    reapCooldown = Math.max(0, reapCooldown - STEP_SECONDS);

    monsters.forEach(function (monster) {
      if (monster.hp <= 0) return;
      monster.attackCooldown = Math.max(0, monster.attackCooldown - STEP_SECONDS);
      if (monster.attackCooldown <= 0) {
        champion.hp = Math.max(
          0,
          champion.hp - Sim.mitigatePhysical(monster.damage, champion.armor)
        );
        monster.attackCooldown = 1.2;
      }
    });
    if (champion.hp <= 0) break;

    const target = monsters.find(function (monster) {
      return monster.hp > 0;
    });
    if (!target) break;

    if (reapCooldown <= 0 && Sim.reapExecutes(target.hp, 1)) {
      target.hp = 0;
      reapCooldown = 15;
      reapCasts += 1;
    } else if (champion.attackCooldown <= 0) {
      target.hp = Math.max(
        0,
        target.hp - Sim.mitigatePhysical(champion.damage, 10)
      );
      champion.attackCooldown = champion.attackPeriod;
    }
  }

  const cleared = monsters.every(function (monster) { return monster.hp <= 0; });
  return {
    kind: kind,
    cleared: cleared,
    durationSeconds: Number((ticks * STEP_SECONDS).toFixed(1)),
    timedOut: !cleared && champion.hp > 0 && ticks === maxTicks,
    botHpRemaining: Number(champion.hp.toFixed(1)),
    monstersRemaining: monsters.filter(function (monster) { return monster.hp > 0; }).length,
    reapCasts: reapCasts,
    gold: cleared ? stats.gold : 0,
    xp: cleared ? stats.xp : 0,
  };
}

function runBalanceReport(options) {
  options = options || {};
  const scenario = options.scenario || "all";
  const maxSeconds = options.maxSeconds === undefined ? DEFAULT_MAX_SECONDS : options.maxSeconds;
  assertMaxSeconds(maxSeconds);
  if (scenario !== "all" && scenario !== "lane" && scenario !== "camp") {
    throw new Error("scenario must be lane, camp, or all");
  }

  const report = {
    version: 1,
    stepSeconds: STEP_SECONDS,
    maxSeconds: maxSeconds,
  };
  if (scenario === "all" || scenario === "lane") {
    report.lane = simulateLane(maxSeconds);
  }
  if (scenario === "all" || scenario === "camp") {
    report.camps = CAMP_KINDS.map(function (kind) {
      return simulateCamp(kind, maxSeconds);
    });
  }
  return report;
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag !== "--scenario" && flag !== "--max-seconds") {
      throw new Error("unknown option: " + flag);
    }
    if (value === undefined || value.indexOf("--") === 0) {
      throw new Error("missing value for " + flag);
    }
    if (flag === "--scenario") {
      options.scenario = value;
    } else {
      options.maxSeconds = Number(value);
    }
    index += 1;
  }
  return options;
}

if (require.main === module) {
  try {
    process.stdout.write(JSON.stringify(runBalanceReport(parseArgs(process.argv.slice(2))), null, 2) + "\n");
  } catch (error) {
    process.stderr.write(error.message + "\n");
    process.exitCode = 1;
  }
}

module.exports = {
  runBalanceReport: runBalanceReport,
};
