"use strict";
/*
 * Shatterlane simulation core.
 *
 * Pure numbers and rules, shared by the browser game (src/game.js) and the
 * headless tests (tests/). No DOM, no canvas, no randomness in here unless a
 * function takes a random source as an argument. If a rule changes, change it
 * here and update docs/design.md in the same pull request.
 */

// ----------------------------------------------------------- champion data

// Original Shatterlane champion definitions. Keep base stats here so the
// browser game and headless tools use the same source of truth.
const CHAMPIONS = Object.freeze({
  bloop: Object.freeze({
    displayName: "Bloop, the Bounceback Blob",
    baseStats: Object.freeze({
      maxHp: 680,
      maxMana: 300,
      baseAd: 62,
      armor: 32,
      magicResist: 32,
      moveSpeed: 335,
      attackRange: 150,
      attackPeriod: 0.9,
    }),
  }),
});

// Returns a copy of the definition so runtime state cannot mutate the catalog.
function getChampionDefinition(championKey) {
  if (!Object.prototype.hasOwnProperty.call(CHAMPIONS, championKey)) {
    throw new Error("unknown champion: " + championKey);
  }
  const definition = CHAMPIONS[championKey];
  return {
    displayName: definition.displayName,
    baseStats: Object.assign({}, definition.baseStats),
  };
}

// Combat and reward stats for lane minions and jungle camps. Map positions
// and display names are owned by the browser layer.
const MINION_STATS = Object.freeze({
  melee: Object.freeze({ hp: 480, damage: 11, range: 105, radius: 13, speed: 105 }),
  caster: Object.freeze({ hp: 290, damage: 16, range: 280, radius: 12, speed: 105 }),
  siege: Object.freeze({ hp: 850, damage: 22, range: 120, radius: 17, speed: 95 }),
});

const CAMP_STATS = Object.freeze({
  buff: Object.freeze({
    kind: "buff",
    monsters: 1,
    monsterHp: 950,
    monsterDamage: 22,
    monsterRadius: 24,
    gold: 90,
    xp: 120,
  }),
  wolves: Object.freeze({
    kind: "small",
    monsters: 2,
    monsterHp: 520,
    monsterDamage: 11,
    monsterRadius: 17,
    gold: 70,
    xp: 95,
  }),
  golems: Object.freeze({
    kind: "small",
    monsters: 2,
    monsterHp: 640,
    monsterDamage: 13,
    monsterRadius: 17,
    gold: 75,
    xp: 100,
  }),
  thornbacks: Object.freeze({
    kind: "small",
    monsters: 2,
    monsterHp: 480,
    monsterDamage: 12,
    monsterRadius: 17,
    gold: 65,
    xp: 90,
  }),
});

// ---------------------------------------------------------------- economy

// Gold granted for landing the killing blow on a minion, by minion kind.
const LAST_HIT_GOLD = {
  melee: 21,
  caster: 17,
  siege: 35,
};

// Gold a nearby ally receives when a minion dies without them last hitting.
const SHARED_GOLD = 6;

// Ambient gold: every AMBIENT_GOLD_TICK seconds after AMBIENT_GOLD_START.
const AMBIENT_GOLD_START = 60; // seconds into the game
const AMBIENT_GOLD_TICK = 5;
const AMBIENT_GOLD_AMOUNT = 3;

// XP granted when a minion dies, by minion kind (split among nearby allies).
const MINION_XP = {
  melee: 60,
  caster: 30,
  siege: 90,
};

// Returns the blue and red wave composition and route for every lane.
function minionWaveGroups(lanes, waveNumber) {
  const kinds = ["melee", "melee", "melee", "caster", "caster", "caster"];
  if (waveNumber % 3 === 0) kinds.push("siege");

  const groups = [];
  Object.keys(lanes).forEach(function (lane) {
    const path = lanes[lane];
    groups.push({ lane: lane, team: "blue", path: path.slice(), kinds: kinds.slice() });
    groups.push({ lane: lane, team: "red", path: path.slice().reverse(), kinds: kinds.slice() });
  });
  return groups;
}

// XP needed to go from `level` to `level + 1`. Level 1 is the start.
function xpToNextLevel(level) {
  return 180 + (level - 1) * 90;
}

// Total cumulative XP required to reach `level` (level 1 needs 0).
function cumulativeXpForLevel(level) {
  let total = 0;
  for (let l = 1; l < level; l += 1) total += xpToNextLevel(l);
  return total;
}

// Highest level whose cumulative XP requirement is <= xp.
function levelFromXp(xp) {
  let level = 1;
  while (cumulativeXpForLevel(level + 1) <= xp) level += 1;
  return level;
}

// Split `amount` of XP among `count` nearby allies. Everyone gets an equal
// share, rounded down; the remainder is lost. count <= 0 yields 0.
function splitXp(amount, count) {
  if (count <= 0) return 0;
  return Math.floor(amount / count);
}

// ---------------------------------------------------------------- camps

// Respawn delays in seconds, counted from the moment the camp is fully
// cleared (last monster killed).
const CAMP_RESPAWN = {
  small: 150,
  buff: 300,
  epic: 360,
};

// A camp is a plain object: { kind, alive, clearedAt, respawnAt }.
// `now` values are seconds since game start.

// Returns a fresh camp state.
function createCamp(kind) {
  return { kind: kind, alive: true, clearedAt: null, respawnAt: null };
}

// Marks a camp cleared at time `now` and schedules its respawn.
// Returns the camp for chaining.
function clearCamp(camp, now) {
  camp.alive = false;
  camp.clearedAt = now;
  camp.respawnAt = now + CAMP_RESPAWN[camp.kind];
  return camp;
}

// True if the camp should be alive at time `now`. A camp that was never
// cleared is alive. A cleared camp respawns exactly at respawnAt.
function isCampAlive(camp, now) {
  if (camp.alive) return true;
  return now >= camp.respawnAt;
}

// Brings a camp back if its respawn time has arrived. Returns true if the
// camp respawned on this call.
function updateCamp(camp, now) {
  if (!camp.alive && isCampAlive(camp, now)) {
    camp.alive = true;
    camp.clearedAt = null;
    camp.respawnAt = null;
    return true;
  }
  return false;
}

// Seconds remaining until respawn, or 0 if the camp is alive.
function campRespawnRemaining(camp, now) {
  if (camp.alive) return 0;
  return Math.max(0, camp.respawnAt - now);
}

// ---------------------------------------------------------------- combat

// Physical damage after armor mitigation. Armor can be negative, which
// amplifies damage; the negative branch uses the mirrored formula.
function mitigatePhysical(rawDamage, armor) {
  if (armor >= 0) return rawDamage * (100 / (100 + armor));
  return rawDamage * (2 - 100 / (100 - armor));
}

// Magic damage after magic resist mitigation (same curve as armor).
function mitigateMagic(rawDamage, magicResist) {
  return mitigatePhysical(rawDamage, magicResist);
}

// Ability definitions for Bloop, the Bounceback Blob. Damage values are
// per rank (index 0 is rank 1). Ratios multiply bonus attack damage
// (bonusAd) or ability power (ap) as noted per ability. An ability with a
// maxHpRatio also deals that fraction of the target's max health as raw
// damage (added before mitigation, inside abilityDamage).
const ABILITIES = {
  stretchGrab: {
    name: "Stretch Grab",
    cooldown: 11,
    manaCost: 55,
    damageType: "magic",
    // Damage is dealt by the recast slam, not by the grab itself.
    baseDamage: [60, 95, 130, 165, 200],
    adRatio: 0,
    apRatio: 0.6,
    grabRange: 550,
    grabWindowSeconds: 4,
  },
  oozeBurst: {
    name: "Ooze Burst",
    cooldown: 10,
    manaCost: 60,
    damageType: "magic",
    baseDamage: [50, 75, 100, 125, 150],
    adRatio: 0,
    apRatio: 0.3,
    maxHpRatio: [0.05, 0.06, 0.07, 0.08, 0.09],
    radius: 230,
  },
  elasticLaunch: {
    name: "Elastic Launch",
    cooldown: 14,
    manaCost: 60,
    damageType: "magic",
    baseDamage: [60, 90, 120, 150, 180],
    adRatio: 0,
    apRatio: 0.5,
    minRange: 300,
    maxRange: 800,
    maxChargeSeconds: 1.2,
    knockupSeconds: 1.0,
    radius: 200,
  },
  boingBarrage: {
    name: "Boing Barrage",
    cooldown: 100,
    manaCost: 100,
    damageType: "magic",
    // Damage is per bounce.
    baseDamage: [120, 170, 220],
    adRatio: 0,
    apRatio: 0.4,
    bounces: 4,
    radius: 240,
    slowFraction: 0.3,
    slowSeconds: 1.0,
    bounceInterval: 0.75,
    knockbackDistance: 120,
  },
};

// Raw (pre-mitigation) flat damage of an ability at a 1-based rank, given
// the caster's bonus attack damage and ability power. Does not include
// any max-health component; see abilityMaxHpDamage.
function abilityRawDamage(abilityKey, rank, bonusAd, ap) {
  const def = ABILITIES[abilityKey];
  if (!def) throw new Error("unknown ability: " + abilityKey);
  const idx = Math.min(rank, def.baseDamage.length) - 1;
  return def.baseDamage[idx] + def.adRatio * bonusAd + def.apRatio * ap;
}

// Raw damage an ability deals from the target's max health alone (0 for
// abilities without a maxHpRatio).
function abilityMaxHpDamage(abilityKey, rank, targetMaxHp) {
  const def = ABILITIES[abilityKey];
  if (!def) throw new Error("unknown ability: " + abilityKey);
  if (!def.maxHpRatio) return 0;
  const idx = Math.min(rank, def.maxHpRatio.length) - 1;
  return def.maxHpRatio[idx] * targetMaxHp;
}

// Full pipeline: raw damage (flat plus any max-health component), then
// mitigation by the matching defense stat.
function abilityDamage(abilityKey, rank, bonusAd, ap, target) {
  const def = ABILITIES[abilityKey];
  let raw = abilityRawDamage(abilityKey, rank, bonusAd, ap);
  if (def.maxHpRatio) raw += abilityMaxHpDamage(abilityKey, rank, target.maxHp || 0);
  if (def.damageType === "physical") return mitigatePhysical(raw, target.armor);
  return mitigateMagic(raw, target.magicResist);
}

// Launch distance for Elastic Launch after charging for `chargeSeconds`.
// Zero charge still hops minRange; a full charge (maxChargeSeconds or
// longer) reaches maxRange.
function launchRange(chargeSeconds) {
  const def = ABILITIES.elasticLaunch;
  const frac = Math.max(0, Math.min(1, chargeSeconds / def.maxChargeSeconds));
  return def.minRange + frac * (def.maxRange - def.minRange);
}

// ------------------------------------------------------------- passive

// Loose Gel, Bloop's passive. When Bloop takes damage, a chunk of gel
// drops off (at most one per chunkDropCooldown seconds); walking over a
// chunk heals him. On lethal damage he instead splits into bloblets that
// crawl toward each other; if at least one is still alive after
// blobletReviveSeconds, he pulls himself back together with partial HP.
const PASSIVE = {
  name: "Loose Gel",
  chunkHealFraction: 0.06, // of max HP, per chunk picked up
  chunkDropCooldown: 4, // seconds between chunk drops
  chunkLifetimeSeconds: 25,
  blobletCount: 4,
  blobletHpFraction: 0.12, // of Bloop's max HP, per bloblet
  blobletReviveSeconds: 6,
  reviveBaseFraction: 0.1, // of max HP on revive, plus per survivor:
  revivePerBlobletFraction: 0.05,
  cooldown: 90, // seconds from the split until the passive can fire again
};

// Health restored by picking up one gel chunk.
function chunkHealAmount(maxHp) {
  return maxHp * PASSIVE.chunkHealFraction;
}

// Health Bloop revives with when `survivingBloblets` bloblets make it to
// the merge. Zero survivors means no revive (0).
function blobletReviveHp(maxHp, survivingBloblets) {
  if (survivingBloblets <= 0) return 0;
  const frac =
    PASSIVE.reviveBaseFraction +
    PASSIVE.revivePerBlobletFraction * survivingBloblets;
  return maxHp * frac;
}

// True when the bloblets have survived long enough, with at least one
// still alive, for Bloop to revive.
function shouldRevive(survivingBloblets, elapsedSeconds) {
  return survivingBloblets > 0 && elapsedSeconds >= PASSIVE.blobletReviveSeconds;
}

// ---------------------------------------------------------------- towers

// Lane tower stats, identical for both teams. Positions live in game.js.
const TOWER = {
  maxHp: 2500,
  damage: 160,
  range: 260,
  attackPeriod: 1.2, // seconds between shots
  radius: 26,
  armor: 30,
};

// How long (seconds) a tower remembers that a champion earned its aggro.
const TOWER_AGGRO_WINDOW = 3;

// Damage of one tower shot against a target with the given armor.
function towerShotDamage(armor) {
  return mitigatePhysical(TOWER.damage, armor);
}

// Picks a tower's next target. `tower` is { id, x, y }. Each candidate
// is { kind: "minion" | "champion", x, y, hp, radius, aggro } where
// aggro is null or { towerId, at } recording when this champion last
// damaged an allied champion under that tower. Priority:
//   1. A champion whose aggro on THIS tower is still fresh (newest
//      aggro wins if several qualify).
//   2. The nearest enemy minion in range.
//   3. The nearest enemy champion in range.
// Out-of-range and dead candidates are ignored. Returns the candidate
// object itself, or null when nothing can be shot.
function selectTowerTarget(tower, candidates, now) {
  const inRange = candidates.filter(function (c) {
    if (c.hp <= 0) return false;
    const dx = c.x - tower.x;
    const dy = c.y - tower.y;
    return Math.sqrt(dx * dx + dy * dy) <= TOWER.range + (c.radius || 0);
  });
  let bestAggro = null;
  inRange.forEach(function (c) {
    if (c.kind !== "champion" || !c.aggro) return;
    if (c.aggro.towerId !== tower.id) return;
    if (now - c.aggro.at > TOWER_AGGRO_WINDOW) return;
    if (!bestAggro || c.aggro.at > bestAggro.aggro.at) bestAggro = c;
  });
  if (bestAggro) return bestAggro;
  let best = null;
  let bestD = Infinity;
  inRange.forEach(function (c) {
    if (c.kind !== "minion") return;
    const dx = c.x - tower.x;
    const dy = c.y - tower.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  });
  if (best) return best;
  inRange.forEach(function (c) {
    if (c.kind !== "champion") return;
    const dx = c.x - tower.x;
    const dy = c.y - tower.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  });
  return best;
}

// ------------------------------------------------------- Reap (camp execute)

// Reap is the camp execute available to every champion. It deals flat true
// damage to a camp monster, scaling with champion level.
function reapDamage(championLevel) {
  return 450 + (championLevel - 1) * 40;
}

// True if a Reap cast would kill a camp monster with `monsterHp` health.
// Reap only works on camp monsters; game.js enforces the target type.
function reapExecutes(monsterHp, championLevel) {
  return monsterHp <= reapDamage(championLevel);
}

// ---------------------------------------------------------------- exports

const Sim = {
  CHAMPIONS,
  getChampionDefinition,
  MINION_STATS,
  CAMP_STATS,
  LAST_HIT_GOLD,
  SHARED_GOLD,
  AMBIENT_GOLD_START,
  AMBIENT_GOLD_TICK,
  AMBIENT_GOLD_AMOUNT,
  MINION_XP,
  minionWaveGroups,
  xpToNextLevel,
  cumulativeXpForLevel,
  levelFromXp,
  splitXp,
  CAMP_RESPAWN,
  createCamp,
  clearCamp,
  isCampAlive,
  updateCamp,
  campRespawnRemaining,
  mitigatePhysical,
  mitigateMagic,
  ABILITIES,
  abilityRawDamage,
  abilityMaxHpDamage,
  abilityDamage,
  launchRange,
  PASSIVE,
  chunkHealAmount,
  blobletReviveHp,
  shouldRevive,
  TOWER,
  TOWER_AGGRO_WINDOW,
  towerShotDamage,
  selectTowerTarget,
  reapDamage,
  reapExecutes,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = Sim;
}
if (typeof window !== "undefined") {
  window.Sim = Sim;
}
