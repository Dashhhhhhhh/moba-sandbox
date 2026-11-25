"use strict";
/*
 * Shatterlane simulation core.
 *
 * Pure numbers and rules, shared by the browser game (src/game.js) and the
 * headless tests (tests/). No DOM, no canvas, no randomness in here unless a
 * function takes a random source as an argument. If a rule changes, change it
 * here and update docs/design.md in the same pull request.
 */

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

// Ability definitions for Korrin, the Briar Knight. Damage values are per
// rank (index 0 is rank 1). Ratios multiply bonus attack damage (bonusAd)
// or ability power (ap) as noted per ability.
const ABILITIES = {
  briarLash: {
    name: "Briar Lash",
    cooldown: 7,
    manaCost: 50,
    damageType: "physical",
    baseDamage: [70, 105, 140, 175, 210],
    adRatio: 0.7,
    apRatio: 0,
  },
  rootSnare: {
    name: "Root Snare",
    cooldown: 12,
    manaCost: 70,
    damageType: "magic",
    baseDamage: [60, 95, 130, 165, 200],
    adRatio: 0,
    apRatio: 0.6,
    rootSeconds: [1.0, 1.15, 1.3, 1.45, 1.6],
  },
  thornDash: {
    name: "Thorn Dash",
    cooldown: 10,
    manaCost: 40,
    damageType: "physical",
    baseDamage: [40, 65, 90, 115, 140],
    adRatio: 0.5,
    apRatio: 0,
    dashRange: 425,
  },
  verdantCataclysm: {
    name: "Verdant Cataclysm",
    cooldown: 90,
    manaCost: 100,
    damageType: "magic",
    baseDamage: [200, 300, 400],
    adRatio: 0,
    apRatio: 0.9,
  },
};

// Raw (pre-mitigation) damage of an ability at a 1-based rank, given the
// caster's bonus attack damage and ability power.
function abilityRawDamage(abilityKey, rank, bonusAd, ap) {
  const def = ABILITIES[abilityKey];
  if (!def) throw new Error("unknown ability: " + abilityKey);
  const idx = Math.min(rank, def.baseDamage.length) - 1;
  return def.baseDamage[idx] + def.adRatio * bonusAd + def.apRatio * ap;
}

// Full pipeline: raw damage, then mitigation by the matching defense stat.
function abilityDamage(abilityKey, rank, bonusAd, ap, target) {
  const def = ABILITIES[abilityKey];
  const raw = abilityRawDamage(abilityKey, rank, bonusAd, ap);
  if (def.damageType === "physical") return mitigatePhysical(raw, target.armor);
  return mitigateMagic(raw, target.magicResist);
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
  LAST_HIT_GOLD,
  SHARED_GOLD,
  AMBIENT_GOLD_START,
  AMBIENT_GOLD_TICK,
  AMBIENT_GOLD_AMOUNT,
  MINION_XP,
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
  abilityDamage,
  reapDamage,
  reapExecutes,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = Sim;
}
if (typeof window !== "undefined") {
  window.Sim = Sim;
}
