"use strict";
/*
 * Shatterlane browser prototype.
 *
 * Rendering and real-time glue only. All balance numbers and rules live in
 * src/sim.js (window.Sim). No build step: index.html loads sim.js, then this.
 */

(function () {
  const Sim = window.Sim;

  // ------------------------------------------------------------ world setup

  const WORLD = 1500; // world is WORLD x WORLD units
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const BLUE_BASE = { x: 120, y: 1380 };
  const RED_BASE = { x: 1380, y: 120 };

  const LANES = {
    top: [
      { x: 120, y: 1380 },
      { x: 120, y: 120 },
      { x: 1380, y: 120 },
    ],
    mid: [
      { x: 120, y: 1380 },
      { x: 750, y: 750 },
      { x: 1380, y: 120 },
    ],
    bot: [
      { x: 120, y: 1380 },
      { x: 1380, y: 1380 },
      { x: 1380, y: 120 },
    ],
  };

  // Camp definitions. Positions are in world units. Red side camps are the
  // mirror of blue side camps through the map centre. Balance data lives in
  // Sim.CAMP_STATS.
  const CAMP_DEFS = [
    { id: "blue-buff", name: "Crimson Brute", x: 420, y: 1080, stats: Sim.CAMP_STATS.buff },
    { id: "blue-wolves", name: "Ember Wolves", x: 300, y: 900, stats: Sim.CAMP_STATS.wolves },
    { id: "blue-golems", name: "Stone Golems", x: 560, y: 1240, stats: Sim.CAMP_STATS.golems },
    { id: "blue-thorn", name: "Thornbacks", x: 700, y: 950, stats: Sim.CAMP_STATS.thornbacks },
    { id: "red-buff", name: "Crimson Brute", x: 1080, y: 420, stats: Sim.CAMP_STATS.buff },
    { id: "red-wolves", name: "Ember Wolves", x: 1200, y: 600, stats: Sim.CAMP_STATS.wolves },
    { id: "red-golems", name: "Stone Golems", x: 940, y: 260, stats: Sim.CAMP_STATS.golems },
    { id: "red-thorn", name: "Thornbacks", x: 800, y: 550, stats: Sim.CAMP_STATS.thornbacks },
  ];

  // ------------------------------------------------------------ state

  const state = {
    time: 0,
    lastWaveAt: -15, // first wave spawns at t = 15
    waveCount: 0,
    minions: [],
    projectiles: [],
    chunks: [],
    towers: [],
    tracers: [],
    camps: [],
    keys: {},
    mouse: { x: 750, y: 750 },
    moveTarget: null,
    gameOver: false,
  };

  const heroDefinition = Sim.getChampionDefinition("bloop");
  const heroStats = heroDefinition.baseStats;
  const hero = {
    name: "Bloop",
    displayName: heroDefinition.displayName,
    team: "blue",
    isChampion: true,
    towerAggro: null, // { towerId, at } set when he earns a tower's attention
    x: BLUE_BASE.x + 60,
    y: BLUE_BASE.y - 60,
    radius: 20,
    maxHp: heroStats.maxHp,
    hp: heroStats.maxHp,
    maxMana: heroStats.maxMana,
    mana: heroStats.maxMana,
    baseAd: heroStats.baseAd,
    bonusAd: 0,
    emberSigilExpiresAt: 0,
    ap: 0,
    armor: heroStats.armor,
    magicResist: heroStats.magicResist,
    moveSpeed: heroStats.moveSpeed,
    attackRange: heroStats.attackRange,
    attackCooldown: 0,
    attackPeriod: heroStats.attackPeriod,
    xp: 0,
    level: 1,
    gold: 475,
    kills: 0,
    deaths: 0,
    dead: false,
    respawnAt: 0,
    rootUntil: 0,
    cooldowns: { stretchGrab: 0, oozeBurst: 0, elasticLaunch: 0, boingBarrage: 0, reap: 0 },
    // Loose Gel passive state.
    lastHp: heroStats.maxHp,
    chunkCd: 0,
    passiveReadyAt: 0,
    split: false,
    splitAt: 0,
    bloblets: [],
    // Ability-in-progress state.
    grab: null, // { targets: [unit], expiresAt, rank }
    chargeStart: null,
    flight: null, // { fromX, fromY, toX, toY, start, duration, rank }
    bounce: null, // { remaining, nextAt, rank, hit: Set }
    lastBounceAt: -10,
  };

  function heroAttackDamage() {
    return hero.baseAd + hero.bonusAd + (hero.level - 1) * 4;
  }

  // Camps pair Sim camp state with live monster units.
  state.camps = CAMP_DEFS.map(function (def) {
    return {
      def: def,
      sim: Sim.createCamp(def.stats.kind),
      monsters: [],
    };
  });

  function spawnCampMonsters(camp) {
    const stats = camp.def.stats;
    camp.monsters = [];
    for (let i = 0; i < stats.monsters; i += 1) {
      const angle = (i / Math.max(1, stats.monsters)) * Math.PI * 2;
      const offset = stats.monsters === 1 ? 0 : 34;
      camp.monsters.push({
        camp: camp,
        x: camp.def.x + Math.cos(angle) * offset,
        y: camp.def.y + Math.sin(angle) * offset,
        homeX: camp.def.x + Math.cos(angle) * offset,
        homeY: camp.def.y + Math.sin(angle) * offset,
        radius: stats.monsterRadius,
        maxHp: stats.monsterHp,
        hp: stats.monsterHp,
        damage: stats.monsterDamage,
        attackCooldown: 0,
        rootUntil: 0,
        alive: true,
        lastAttacker: null,
      });
    }
  }
  state.camps.forEach(spawnCampMonsters);

  // One tower per lane per side, placed 35 percent of the lane's length
  // from its own base. Stats live in Sim.TOWER.
  function lanePoint(path, frac) {
    let total = 0;
    const segs = [];
    for (let i = 1; i < path.length; i += 1) {
      const len = dist(path[i - 1], path[i]);
      segs.push(len);
      total += len;
    }
    let want = total * frac;
    for (let i = 0; i < segs.length; i += 1) {
      if (want <= segs[i]) {
        const a = path[i];
        const b = path[i + 1];
        const t = segs[i] === 0 ? 0 : want / segs[i];
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      }
      want -= segs[i];
    }
    const last = path[path.length - 1];
    return { x: last.x, y: last.y };
  }

  function makeTower(team, lane, pos) {
    return {
      id: team + "-" + lane,
      team: team,
      lane: lane,
      x: pos.x,
      y: pos.y,
      radius: Sim.TOWER.radius,
      maxHp: Sim.TOWER.maxHp,
      hp: Sim.TOWER.maxHp,
      armor: Sim.TOWER.armor,
      attackCooldown: 0,
      rootUntil: 0,
      lastAttacker: null,
    };
  }

  Object.keys(LANES).forEach(function (lane) {
    state.towers.push(makeTower("blue", lane, lanePoint(LANES[lane], 0.35)));
    state.towers.push(makeTower("red", lane, lanePoint(LANES[lane], 0.65)));
  });

  // ------------------------------------------------------------ helpers

  function dist(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function moveToward(unit, target, speed, dt) {
    const d = dist(unit, target);
    if (d < 1) return;
    const step = Math.min(d, speed * dt);
    unit.x += ((target.x - unit.x) / d) * step;
    unit.y += ((target.y - unit.y) / d) * step;
  }

  // Rooted and knocked-up units cannot move or attack.
  function isRooted(unit) {
    return state.time < unit.rootUntil || state.time < (unit.airborneUntil || 0);
  }

  // Movement speed multiplier after slows (1 when not slowed).
  function speedFactor(unit) {
    if (state.time < (unit.slowUntil || 0)) return 1 - (unit.slowFraction || 0);
    return 1;
  }

  // True while Bloop's Stretch Grab is holding this unit.
  function isGrabbed(unit) {
    return !!hero.grab && hero.grab.targets.indexOf(unit) !== -1;
  }

  function damageUnit(unit, amount, attacker) {
    unit.hp -= amount;
    unit.lastAttacker = attacker;
    // Tower aggro bookkeeping: a champion who hurts an enemy champion
    // while both are under one of that champion's towers earns those
    // towers' attention (see Sim.selectTowerTarget).
    if (attacker && attacker.isChampion && unit.isChampion && attacker !== unit) {
      state.towers.forEach(function (t) {
        if (t.team !== unit.team || t.hp <= 0) return;
        const nearAttacker = dist(attacker, t) <= Sim.TOWER.range + attacker.radius;
        const nearVictim = dist(unit, t) <= Sim.TOWER.range + unit.radius;
        if (nearAttacker && nearVictim) {
          attacker.towerAggro = { towerId: t.id, at: state.time };
        }
      });
    }
  }

  function gainXp(amount) {
    const before = hero.level;
    hero.xp += amount;
    hero.level = Sim.levelFromXp(hero.xp);
    if (hero.level > before) {
      hero.maxHp += 95 * (hero.level - before);
      hero.maxMana += 35 * (hero.level - before);
      hero.hp = Math.min(hero.maxHp, hero.hp + 120);
      hero.mana = hero.maxMana;
    }
  }

  // ------------------------------------------------------------ minions

  function spawnWave() {
    state.waveCount += 1;
    Sim.minionWaveGroups(LANES, state.waveCount).forEach(function (group) {
      group.kinds.forEach(function (kind, i) {
        const s = Sim.MINION_STATS[kind];
        state.minions.push({
          team: group.team,
          kind: kind,
          x: group.path[0].x + (i % 3) * 26 - 26,
          y: group.path[0].y + Math.floor(i / 3) * 26 - 13,
          radius: s.radius,
          maxHp: s.hp,
          hp: s.hp,
          damage: s.damage,
          range: s.range,
          speed: s.speed,
          path: group.path,
          waypoint: 1,
          attackCooldown: 0,
          rootUntil: 0,
          lastAttacker: null,
        });
      });
    });
  }

  function nearestEnemyMinion(m) {
    let best = null;
    let bestD = Infinity;
    state.minions.forEach(function (other) {
      if (other.team === m.team || other.hp <= 0) return;
      const d = dist(m, other);
      if (d < bestD) {
        bestD = d;
        best = other;
      }
    });
    // Enemy towers are valid targets too: a wave marches until it can
    // chew on one.
    state.towers.forEach(function (t) {
      if (t.team === m.team || t.hp <= 0) return;
      const d = dist(m, t);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    });
    // The hero is a valid target for red minions, except while he is
    // split into bloblets; then the bloblets are the targets.
    if (m.team === "red" && !hero.dead && !hero.split) {
      const d = dist(m, hero);
      if (d < bestD) {
        best = hero;
        bestD = d;
      }
    }
    if (m.team === "red" && hero.split) {
      hero.bloblets.forEach(function (b) {
        if (b.hp <= 0) return;
        const d = dist(m, b);
        if (d < bestD) {
          best = b;
          bestD = d;
        }
      });
    }
    return { unit: best, distance: bestD };
  }

  function updateMinions(dt) {
    // Spawn waves every 30 seconds.
    if (state.time - state.lastWaveAt >= 30) {
      state.lastWaveAt = state.time;
      spawnWave();
    }
    state.minions.forEach(function (m) {
      if (m.hp <= 0) return;
      m.attackCooldown -= dt;
      if (isGrabbed(m)) return; // held by Stretch Grab: no moving or attacking
      const found = nearestEnemyMinion(m);
      if (found.unit && found.distance <= m.range + found.unit.radius) {
        if (m.attackCooldown <= 0) {
          m.attackCooldown = 1.1;
          damageUnit(found.unit, m.damage, m);
        }
        return;
      }
      if (found.unit && found.distance <= 300) {
        if (!isRooted(m)) moveToward(m, found.unit, m.speed * speedFactor(m), dt);
        return;
      }
      const wp = m.path[m.waypoint];
      if (!wp) return;
      if (!isRooted(m)) moveToward(m, wp, m.speed * speedFactor(m), dt);
      if (dist(m, wp) < 14) {
        m.waypoint += 1;
        if (m.waypoint >= m.path.length) {
          // Reached the enemy Heartspire (not yet built): the minion is
          // spent. Structures are GAME-001 / GAME-009 work.
          m.hp = 0;
          m.lastAttacker = null;
          m.reachedEnd = true;
        }
      }
    });
    // Deaths and rewards.
    state.minions = state.minions.filter(function (m) {
      if (m.hp > 0) return true;
      if (!m.reachedEnd && m.team === "red") {
        const byHero = m.lastAttacker === hero;
        if (dist(m, hero) <= 1400 && !hero.dead) {
          if (byHero) {
            hero.gold += Sim.LAST_HIT_GOLD[m.kind];
          } else {
            hero.gold += Sim.SHARED_GOLD;
          }
          gainXp(Sim.splitXp(Sim.MINION_XP[m.kind], 1));
        }
      }
      return false;
    });
  }

  // ------------------------------------------------------------ camps

  function updateCamps(dt) {
    state.camps.forEach(function (camp) {
      if (!camp.sim.alive) {
        if (Sim.updateCamp(camp.sim, state.time)) spawnCampMonsters(camp);
        return;
      }
      let allDead = camp.monsters.length > 0;
      camp.monsters.forEach(function (mon) {
        if (mon.hp > 0) {
          allDead = false;
          mon.attackCooldown -= dt;
          if (isGrabbed(mon)) return; // held by Stretch Grab
          // The camp fights the hero, or his bloblets while he is split.
          let target = null;
          if (hero.split) {
            hero.bloblets.forEach(function (b) {
              if (b.hp <= 0) return;
              if (dist(b, camp.def) < 340 && (!target || dist(b, camp.def) < dist(target, camp.def))) {
                target = b;
              }
            });
          } else if (!hero.dead && dist(hero, camp.def) < 340) {
            target = hero;
          }
          if (target) {
            if (dist(mon, target) <= mon.radius + target.radius + 26) {
              if (mon.attackCooldown <= 0) {
                mon.attackCooldown = 1.2;
                if (target === hero) {
                  hero.hp -= Sim.mitigatePhysical(mon.damage, hero.armor);
                } else {
                  damageUnit(target, mon.damage, mon);
                }
              }
            } else if (!isRooted(mon)) {
              moveToward(mon, target, 165 * speedFactor(mon), dt);
            }
          } else if (dist(mon, { x: mon.homeX, y: mon.homeY }) > 4 && !isRooted(mon)) {
            moveToward(mon, { x: mon.homeX, y: mon.homeY }, 120 * speedFactor(mon), dt);
            mon.hp = Math.min(mon.maxHp, mon.hp + mon.maxHp * 0.08 * dt);
          }
        }
      });
      if (allDead) {
        Sim.clearCamp(camp.sim, state.time);
        hero.gold += camp.def.stats.gold;
        gainXp(camp.def.stats.xp);
        if (camp.def.stats.kind === "buff") {
          hero.emberSigilExpiresAt = Sim.applyEmberSigil(state.time);
        }
      }
    });
  }

  // ------------------------------------------------------------ towers

  function updateTowers(dt) {
    state.tracers = state.tracers.filter(function (tr) {
      tr.life -= dt;
      return tr.life > 0;
    });
    state.towers.forEach(function (t) {
      if (t.hp <= 0) return;
      t.attackCooldown -= dt;
      if (t.attackCooldown > 0) return;
      const candidates = [];
      state.minions.forEach(function (m) {
        if (m.team !== t.team && m.hp > 0) {
          candidates.push({ ref: m, kind: "minion", x: m.x, y: m.y, hp: m.hp, radius: m.radius, aggro: null });
        }
      });
      if (hero.team !== t.team && !hero.dead && !hero.split) {
        candidates.push({ ref: hero, kind: "champion", x: hero.x, y: hero.y, hp: hero.hp, radius: hero.radius, aggro: hero.towerAggro });
      }
      const pick = Sim.selectTowerTarget(t, candidates, state.time);
      if (!pick) return;
      t.attackCooldown = Sim.TOWER.attackPeriod;
      const target = pick.ref;
      const armor = target.armor === undefined ? 0 : target.armor;
      damageUnit(target, Sim.towerShotDamage(armor), t);
      state.tracers.push({ x1: t.x, y1: t.y, x2: target.x, y2: target.y, life: 0.12, team: t.team });
    });
  }

  // ------------------------------------------------------------ hero

  // Sandbox rank rule: basic abilities gain a rank every other level,
  // the ultimate at levels 6, 12, and 18.
  function abilityRank(key) {
    if (key === "boingBarrage") return Math.max(1, Math.floor(hero.level / 6));
    return Math.min(5, Math.ceil(hero.level / 2));
  }

  function castAbility(key) {
    if (hero.dead || hero.split || hero.flight) return;
    // Stretch Grab recast: while a grab is held, Q slams instead of
    // firing a new arm. The cooldown already runs from the first cast.
    if (key === "stretchGrab" && hero.grab) {
      slamGrab();
      return;
    }
    const def = Sim.ABILITIES[key];
    if (hero.cooldowns[key] > 0 || hero.mana < def.manaCost) return;
    hero.mana -= def.manaCost;
    hero.cooldowns[key] = def.cooldown;
    const rank = abilityRank(key);
    const aim = { x: state.mouse.x, y: state.mouse.y };

    if (key === "stretchGrab") {
      // First cast: the arm stretches toward the cursor and grabs the
      // first enemy it touches. No damage until the slam.
      const d = Math.max(1, dist(hero, aim));
      state.projectiles.push({
        x: hero.x,
        y: hero.y,
        vx: ((aim.x - hero.x) / d) * 900,
        vy: ((aim.y - hero.y) / d) * 900,
        radius: 10,
        life: def.grabRange / 900,
        grabArm: true,
        rank: rank,
      });
    } else if (key === "oozeBurst") {
      enemiesInRadius(hero, def.radius).forEach(function (u) {
        damageUnit(u, Sim.abilityDamage(key, rank, hero.bonusAd, hero.ap, u), hero);
      });
      state.projectiles.push({ x: hero.x, y: hero.y, vx: 0, vy: 0, radius: def.radius, life: 0.3, ringOnly: true });
    } else if (key === "boingBarrage") {
      hero.bounce = { remaining: def.bounces, nextAt: state.time, rank: rank, hit: new Set() };
    }
    // elasticLaunch is hold-and-release; see startCharge/releaseLaunch.
  }

  // Stretch Grab recast: drag every grabbed enemy to the aim point and
  // slam them together, dealing the ability's damage to each.
  function slamGrab() {
    const grab = hero.grab;
    hero.grab = null;
    const aim = {
      x: Math.max(20, Math.min(WORLD - 20, state.mouse.x)),
      y: Math.max(20, Math.min(WORLD - 20, state.mouse.y)),
    };
    grab.targets.forEach(function (u) {
      if (u.hp <= 0) return;
      u.x = aim.x;
      u.y = aim.y;
      damageUnit(u, Sim.abilityDamage("stretchGrab", grab.rank, hero.bonusAd, hero.ap, u), hero);
    });
    state.projectiles.push({ x: aim.x, y: aim.y, vx: 0, vy: 0, radius: 120, life: 0.25, ringOnly: true });
  }

  // Elastic Launch: hold E to charge, release to fly.
  function startCharge() {
    if (hero.dead || hero.split || hero.flight || hero.chargeStart !== null) return;
    const def = Sim.ABILITIES.elasticLaunch;
    if (hero.cooldowns.elasticLaunch > 0 || hero.mana < def.manaCost) return;
    hero.chargeStart = state.time;
  }

  function releaseLaunch() {
    if (hero.chargeStart === null) return;
    const chargeSeconds = state.time - hero.chargeStart;
    hero.chargeStart = null;
    if (hero.dead || hero.split || hero.flight) return;
    const def = Sim.ABILITIES.elasticLaunch;
    hero.mana -= def.manaCost;
    hero.cooldowns.elasticLaunch = def.cooldown;
    const range = Sim.launchRange(chargeSeconds);
    const aim = { x: state.mouse.x, y: state.mouse.y };
    const d = Math.max(1, dist(hero, aim));
    const travel = Math.min(range, d);
    hero.flight = {
      fromX: hero.x,
      fromY: hero.y,
      toX: Math.max(hero.radius, Math.min(WORLD - hero.radius, hero.x + ((aim.x - hero.x) / d) * travel)),
      toY: Math.max(hero.radius, Math.min(WORLD - hero.radius, hero.y + ((aim.y - hero.y) / d) * travel)),
      start: state.time,
      duration: 0.35 + travel / 1400,
      rank: abilityRank("elasticLaunch"),
    };
    state.moveTarget = null;
  }

  function landLaunch() {
    const def = Sim.ABILITIES.elasticLaunch;
    const rank = hero.flight.rank;
    hero.flight = null;
    enemiesInRadius(hero, def.radius).forEach(function (u) {
      damageUnit(u, Sim.abilityDamage("elasticLaunch", rank, hero.bonusAd, hero.ap, u), hero);
      u.airborneUntil = state.time + def.knockupSeconds;
    });
    state.projectiles.push({ x: hero.x, y: hero.y, vx: 0, vy: 0, radius: def.radius, life: 0.3, ringOnly: true });
  }

  function knockbackUnit(unit, from, distance) {
    const d = Math.max(1, dist(unit, from));
    unit.x = Math.max(unit.radius, Math.min(WORLD - unit.radius, unit.x + ((unit.x - from.x) / d) * distance));
    unit.y = Math.max(unit.radius, Math.min(WORLD - unit.radius, unit.y + ((unit.y - from.y) / d) * distance));
  }

  // One Boing Barrage bounce: hop toward the cursor, land with damage
  // and a slow; the first bounce that touches an enemy also knocks it
  // back a little.
  function doBounce() {
    const def = Sim.ABILITIES.boingBarrage;
    const b = hero.bounce;
    const aim = { x: state.mouse.x, y: state.mouse.y };
    const d = dist(hero, aim);
    if (d > 1) {
      const step = Math.min(180, d);
      hero.x += ((aim.x - hero.x) / d) * step;
      hero.y += ((aim.y - hero.y) / d) * step;
    }
    hero.lastBounceAt = state.time;
    enemiesInRadius(hero, def.radius).forEach(function (u) {
      damageUnit(u, Sim.abilityDamage("boingBarrage", b.rank, hero.bonusAd, hero.ap, u), hero);
      u.slowUntil = state.time + def.slowSeconds;
      u.slowFraction = def.slowFraction;
      if (!b.hit.has(u)) {
        b.hit.add(u);
        knockbackUnit(u, hero, def.knockbackDistance);
      }
    });
    state.projectiles.push({ x: hero.x, y: hero.y, vx: 0, vy: 0, radius: def.radius, life: 0.3, ringOnly: true });
    b.remaining -= 1;
    b.nextAt = state.time + def.bounceInterval;
    if (b.remaining <= 0) hero.bounce = null;
  }

  // Loose Gel: lethal damage splits Bloop into bloblets instead of
  // killing him (when the passive is off cooldown).
  function enterSplit() {
    hero.split = true;
    hero.splitAt = state.time;
    hero.passiveReadyAt = state.time + Sim.PASSIVE.cooldown;
    hero.grab = null;
    hero.chargeStart = null;
    hero.bounce = null;
    hero.bloblets = [];
    for (let i = 0; i < Sim.PASSIVE.blobletCount; i += 1) {
      const angle = (i / Sim.PASSIVE.blobletCount) * Math.PI * 2;
      hero.bloblets.push({
        x: hero.x + Math.cos(angle) * 34,
        y: hero.y + Math.sin(angle) * 34,
        radius: 10,
        maxHp: hero.maxHp * Sim.PASSIVE.blobletHpFraction,
        hp: hero.maxHp * Sim.PASSIVE.blobletHpFraction,
        rootUntil: 0,
        lastAttacker: null,
      });
    }
  }

  function killHero() {
    hero.dead = true;
    hero.deaths += 1;
    hero.split = false;
    hero.bloblets = [];
    hero.grab = null;
    hero.chargeStart = null;
    hero.bounce = null;
    hero.flight = null;
    hero.respawnAt = state.time + 5 + hero.level * 0.5;
  }

  function castReap() {
    if (hero.dead || hero.split || hero.flight || hero.cooldowns.reap > 0) return;
    let best = null;
    let bestD = Infinity;
    state.camps.forEach(function (camp) {
      camp.monsters.forEach(function (mon) {
        if (mon.hp <= 0) return;
        const d = dist(hero, mon);
        if (d < bestD) {
          bestD = d;
          best = mon;
        }
      });
    });
    if (!best || bestD > 320) return;
    hero.cooldowns.reap = 15;
    if (Sim.reapExecutes(best.hp, hero.level)) {
      best.hp = 0;
      best.lastAttacker = hero;
    } else {
      damageUnit(best, Sim.reapDamage(hero.level), hero);
    }
  }

  function enemiesInRadius(point, radius) {
    const out = [];
    state.minions.forEach(function (m) {
      if (m.team === "red" && m.hp > 0 && dist(point, m) <= radius + m.radius) out.push(m);
    });
    state.camps.forEach(function (camp) {
      camp.monsters.forEach(function (mon) {
        if (mon.hp > 0 && dist(point, mon) <= radius + mon.radius) {
          // Give monsters the defense stats abilityDamage expects.
          if (mon.armor === undefined) {
            mon.armor = 12;
            mon.magicResist = 12;
          }
          out.push(mon);
        }
      });
    });
    return out;
  }

  function updateHero(dt) {
    if (hero.dead) {
      if (state.time >= hero.respawnAt) {
        hero.dead = false;
        hero.hp = hero.maxHp;
        hero.mana = hero.maxMana;
        hero.lastHp = hero.maxHp;
        hero.x = BLUE_BASE.x + 60;
        hero.y = BLUE_BASE.y - 60;
      }
      return;
    }

    // Split into bloblets (Loose Gel): they crawl toward each other
    // while enemies hunt them. Survive the merge timer and Bloop
    // pulls himself back together; lose them all and he really dies.
    if (hero.split) {
      const alive = hero.bloblets.filter(function (b) { return b.hp > 0; });
      if (alive.length === 0) {
        killHero();
        return;
      }
      const centroid = { x: 0, y: 0 };
      alive.forEach(function (b) {
        centroid.x += b.x;
        centroid.y += b.y;
      });
      centroid.x /= alive.length;
      centroid.y /= alive.length;
      alive.forEach(function (b) {
        if (dist(b, centroid) > 16) moveToward(b, centroid, 95, dt);
      });
      if (Sim.shouldRevive(alive.length, state.time - hero.splitAt)) {
        hero.split = false;
        hero.bloblets = [];
        hero.x = centroid.x;
        hero.y = centroid.y;
        hero.hp = Sim.blobletReviveHp(hero.maxHp, alive.length);
        hero.lastHp = hero.hp;
      }
      return;
    }

    // Loose Gel chunks: taking damage sheds a chunk now and then;
    // walking over one heals. Chunks expire.
    if (hero.hp < hero.lastHp && hero.hp > 0 && state.time >= hero.chunkCd) {
      hero.chunkCd = state.time + Sim.PASSIVE.chunkDropCooldown;
      state.chunks.push({
        x: hero.x + (Math.random() - 0.5) * 60,
        y: hero.y + (Math.random() - 0.5) * 60,
        expiresAt: state.time + Sim.PASSIVE.chunkLifetimeSeconds,
      });
    }
    state.chunks = state.chunks.filter(function (c) {
      if (state.time >= c.expiresAt) return false;
      if (dist(hero, c) <= hero.radius + 14) {
        hero.hp = Math.min(hero.maxHp, hero.hp + Sim.chunkHealAmount(hero.maxHp));
        return false;
      }
      return true;
    });
    hero.lastHp = hero.hp;

    // Stretch Grab: the hold expires, and a grab on a dead enemy ends.
    if (hero.grab) {
      hero.grab.targets = hero.grab.targets.filter(function (u) { return u.hp > 0; });
      if (hero.grab.targets.length === 0 || state.time >= hero.grab.expiresAt) {
        hero.grab = null;
      }
    }

    // Elastic Launch flight.
    if (hero.flight) {
      const f = hero.flight;
      const t = Math.min(1, (state.time - f.start) / f.duration);
      hero.x = f.fromX + (f.toX - f.fromX) * t;
      hero.y = f.fromY + (f.toY - f.fromY) * t;
      if (t >= 1) landLaunch();
      return;
    }

    // Regeneration and fountain.
    hero.mana = Math.min(hero.maxMana, hero.mana + 9 * dt);
    hero.hp = Math.min(hero.maxHp, hero.hp + 3.5 * dt);
    if (dist(hero, BLUE_BASE) < 170) {
      hero.hp = Math.min(hero.maxHp, hero.hp + hero.maxHp * 0.12 * dt);
      hero.mana = Math.min(hero.maxMana, hero.mana + hero.maxMana * 0.12 * dt);
    }
    // Ambient gold.
    if (state.time >= Sim.AMBIENT_GOLD_START) {
      hero.gold += (Sim.AMBIENT_GOLD_AMOUNT / Sim.AMBIENT_GOLD_TICK) * dt;
    }

    // Cooldowns.
    Object.keys(hero.cooldowns).forEach(function (k) {
      hero.cooldowns[k] = Math.max(0, hero.cooldowns[k] - dt);
    });
    hero.attackCooldown -= dt;

    // Boing Barrage bounces tick on their own timer.
    if (hero.bounce && state.time >= hero.bounce.nextAt) doBounce();

    // Movement: arrow keys override click-to-move. (Letters are reserved
    // for abilities, so WASD movement is deliberately not used.)
    // Charging Elastic Launch roots Bloop in place while he stretches.
    const speedNow = hero.chargeStart !== null ? 0 : hero.moveSpeed;
    let vx = 0;
    let vy = 0;
    if (state.keys["arrowup"]) vy -= 1;
    if (state.keys["arrowdown"]) vy += 1;
    if (state.keys["arrowleft"]) vx -= 1;
    if (state.keys["arrowright"]) vx += 1;
    if ((vx !== 0 || vy !== 0) && !isRooted(hero) && speedNow > 0) {
      const len = Math.sqrt(vx * vx + vy * vy);
      hero.x += (vx / len) * speedNow * dt;
      hero.y += (vy / len) * speedNow * dt;
      state.moveTarget = null;
    } else if (state.moveTarget && !isRooted(hero)) {
      moveToward(hero, state.moveTarget, speedNow, dt);
      if (dist(hero, state.moveTarget) < 6) state.moveTarget = null;
    }
    hero.x = Math.max(hero.radius, Math.min(WORLD - hero.radius, hero.x));
    hero.y = Math.max(hero.radius, Math.min(WORLD - hero.radius, hero.y));

    // Auto-attack the nearest valid enemy in range.
    let target = null;
    let targetD = Infinity;
    state.minions.forEach(function (m) {
      if (m.team !== "red" || m.hp <= 0) return;
      const d = dist(hero, m);
      if (d < targetD) {
        targetD = d;
        target = m;
      }
    });
    state.camps.forEach(function (camp) {
      if (dist(hero, camp.def) > 360) return;
      camp.monsters.forEach(function (mon) {
        if (mon.hp <= 0) return;
        const d = dist(hero, mon);
        if (d < targetD) {
          targetD = d;
          target = mon;
        }
      });
    });
    state.towers.forEach(function (t) {
      if (t.team === hero.team || t.hp <= 0) return;
      const d = dist(hero, t);
      if (d < targetD) {
        targetD = d;
        target = t;
      }
    });
    if (target && targetD <= hero.attackRange + target.radius && hero.attackCooldown <= 0) {
      hero.attackCooldown = hero.attackPeriod;
      const armor = target.armor === undefined ? 10 : target.armor;
      const attackDamage = Sim.emberSigilAttackDamage(
        heroAttackDamage(),
        hero.emberSigilExpiresAt,
        state.time
      );
      damageUnit(target, Sim.mitigatePhysical(attackDamage, armor), hero);
    }

    if (hero.hp <= 0) {
      // Loose Gel gets one say before death does.
      if (state.time >= hero.passiveReadyAt) {
        enterSplit();
      } else {
        killHero();
      }
    }
  }

  function updateProjectiles(dt) {
    state.projectiles = state.projectiles.filter(function (p) {
      p.life -= dt;
      if (p.life <= 0) return false;
      if (p.ringOnly) return true;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const hits = enemiesInRadius(p, 6);
      if (hits.length > 0) {
        const u = hits[0];
        if (p.grabArm) {
          // Stretch Grab: the first enemy touched is held for the slam.
          hero.grab = {
            targets: [u],
            expiresAt: state.time + Sim.ABILITIES.stretchGrab.grabWindowSeconds,
            rank: p.rank,
          };
        } else {
          damageUnit(u, Sim.abilityDamage(p.damageKey, p.rank, hero.bonusAd, hero.ap, u), hero);
        }
        return false;
      }
      return p.x >= 0 && p.x <= WORLD && p.y >= 0 && p.y <= WORLD;
    });
  }

  // ------------------------------------------------------------ drawing

  // Deterministic pseudo-random for decorative trees.
  function rand(seed) {
    const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  function drawPath(path, width, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i += 1) ctx.lineTo(path[i].x, path[i].y);
    ctx.stroke();
  }

  function drawBar(x, y, w, frac, color) {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(x - w / 2, y, w, 5);
    ctx.fillStyle = color;
    ctx.fillRect(x - w / 2, y, Math.max(0, Math.min(1, frac)) * w, 5);
  }

  function draw() {
    const scale = canvas.width / WORLD;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    // Ground: two halves split along the river diagonal.
    ctx.fillStyle = "#2e5d33";
    ctx.fillRect(0, 0, WORLD, WORLD);
    ctx.fillStyle = "#356b3a";
    ctx.beginPath();
    ctx.moveTo(0, WORLD);
    ctx.lineTo(WORLD, 0);
    ctx.lineTo(WORLD, WORLD);
    ctx.closePath();
    ctx.fill();

    // Jungle texture: deterministic tree dots off lanes and river.
    ctx.fillStyle = "rgba(16, 42, 20, 0.8)";
    for (let i = 0; i < 260; i += 1) {
      const x = rand(i * 2 + 1) * WORLD;
      const y = rand(i * 2 + 2) * WORLD;
      if (Math.abs(x - y) < 90) continue; // keep the river clear
      ctx.beginPath();
      ctx.arc(x, y, 9 + rand(i) * 8, 0, Math.PI * 2);
      ctx.fill();
    }

    // River.
    ctx.strokeStyle = "#2f6db3";
    ctx.lineWidth = 120;
    ctx.beginPath();
    ctx.moveTo(40, 40);
    ctx.lineTo(WORLD - 40, WORLD - 40);
    ctx.stroke();

    // Epic pits (bosses arrive with GAME-006).
    [
      { x: 500, y: 500 },
      { x: 1000, y: 1000 },
    ].forEach(function (pit) {
      ctx.fillStyle = "#59396e";
      ctx.beginPath();
      ctx.arc(pit.x, pit.y, 58, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#c9a227";
      ctx.lineWidth = 4;
      ctx.stroke();
    });

    // Lanes.
    Object.keys(LANES).forEach(function (k) {
      drawPath(LANES[k], 64, "#8a7f5c");
      drawPath(LANES[k], 52, "#9c8f68");
    });

    // Bases.
    [
      { p: BLUE_BASE, c: "#3a7bd5" },
      { p: RED_BASE, c: "#d53a3a" },
    ].forEach(function (b) {
      ctx.fillStyle = b.c;
      ctx.beginPath();
      ctx.arc(b.p.x, b.p.y, 52, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 20px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Heartspire", b.p.x, b.p.y + 84);
    });

    // Camps.
    state.camps.forEach(function (camp) {
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.beginPath();
      ctx.arc(camp.def.x, camp.def.y, 62, 0, Math.PI * 2);
      ctx.fill();
      if (!camp.sim.alive) {
        const remaining = Math.ceil(Sim.campRespawnRemaining(camp.sim, state.time));
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 26px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(remaining + "s", camp.def.x, camp.def.y + 8);
        return;
      }
      ctx.fillStyle = "#e8e3d0";
      ctx.font = "13px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(camp.def.name, camp.def.x, camp.def.y - 52);
      camp.monsters.forEach(function (mon) {
        if (mon.hp <= 0) return;
        ctx.fillStyle = camp.def.stats.kind === "buff" ? "#b3541e" : "#7a6a53";
        ctx.beginPath();
        ctx.arc(mon.x, mon.y, mon.radius, 0, Math.PI * 2);
        ctx.fill();
        drawBar(mon.x, mon.y - mon.radius - 12, 44, mon.hp / mon.maxHp, "#c0392b");
      });
    });

    // Towers (destroyed ones stay as rubble).
    state.towers.forEach(function (t) {
      if (t.hp <= 0) {
        ctx.fillStyle = "#5a5348";
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.radius, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      ctx.fillStyle = "#8d8578";
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.radius + 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = t.team === "blue" ? "#3a7bd5" : "#d53a3a";
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Tower", t.x, t.y + 4);
      drawBar(t.x, t.y - t.radius - 14, 52, t.hp / t.maxHp, t.team === "blue" ? "#3a7bd5" : "#d53a3a");
    });

    // Tower shot tracers.
    state.tracers.forEach(function (tr) {
      ctx.strokeStyle = tr.team === "blue" ? "rgba(120,180,255,0.9)" : "rgba(255,120,120,0.9)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(tr.x1, tr.y1);
      ctx.lineTo(tr.x2, tr.y2);
      ctx.stroke();
    });

    // Minions.
    state.minions.forEach(function (m) {
      if (m.hp <= 0) return;
      ctx.fillStyle = m.team === "blue" ? "#3a7bd5" : "#d53a3a";
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.radius, 0, Math.PI * 2);
      ctx.fill();
      drawBar(m.x, m.y - m.radius - 10, 30, m.hp / m.maxHp, m.team === "blue" ? "#3a7bd5" : "#d53a3a");
    });

    // Projectiles and ability rings.
    state.projectiles.forEach(function (p) {
      if (p.ringOnly) {
        ctx.strokeStyle = "rgba(255, 220, 120, 0.8)";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = "#ffe08a";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // Gel chunks shed by the passive.
    state.chunks.forEach(function (c, i) {
      const pulse = 1 + 0.15 * Math.sin(state.time * 4 + i * 1.7);
      ctx.fillStyle = "#6fdc5f";
      ctx.beginPath();
      ctx.arc(c.x, c.y, 7 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.beginPath();
      ctx.arc(c.x - 2, c.y - 2, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // Hero.
    if (hero.split) {
      // Bloblets: little green blobs crawling toward each other.
      hero.bloblets.forEach(function (b) {
        if (b.hp <= 0) return;
        ctx.fillStyle = "#57c84d";
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.45)";
        ctx.beginPath();
        ctx.arc(b.x - 3, b.y - 3, 3, 0, Math.PI * 2);
        ctx.fill();
        drawBar(b.x, b.y - b.radius - 10, 26, b.hp / b.maxHp, "#3fae4a");
      });
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 22px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        "Split! Bloblets merge in " + Math.max(0, Math.ceil(hero.splitAt + Sim.PASSIVE.blobletReviveSeconds - state.time)) + "s",
        WORLD / 2,
        60
      );
    } else if (!hero.dead) {
      // Stretch Grab arm, while a victim is held.
      if (hero.grab) {
        hero.grab.targets.forEach(function (u) {
          ctx.strokeStyle = "#57c84d";
          ctx.lineWidth = 8;
          ctx.beginPath();
          ctx.moveTo(hero.x, hero.y);
          ctx.lineTo(u.x, u.y);
          ctx.stroke();
          ctx.fillStyle = "#57c84d";
          ctx.beginPath();
          ctx.arc(u.x, u.y, 11, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      // Flight arc for Elastic Launch: the blob rides above its shadow.
      let lift = 0;
      let sx = 1;
      let sy = 1;
      if (hero.flight) {
        const t = Math.min(1, (state.time - hero.flight.start) / hero.flight.duration);
        lift = Math.sin(t * Math.PI) * 64;
        sx = 0.82;
        sy = 1.28;
        ctx.fillStyle = "rgba(0,0,0,0.3)";
        ctx.beginPath();
        ctx.arc(hero.x, hero.y, hero.radius * 0.8, 0, Math.PI * 2);
        ctx.fill();
      } else if (hero.chargeStart !== null) {
        // Charging: squash down as the stretch builds.
        const f = Math.min(1, (state.time - hero.chargeStart) / Sim.ABILITIES.elasticLaunch.maxChargeSeconds);
        sx = 1 + 0.3 * f;
        sy = 1 - 0.3 * f;
        // Landing preview: line and circle at the launch destination.
        const range = Sim.launchRange(state.time - hero.chargeStart);
        const d = Math.max(1, dist(hero, state.mouse));
        const travel = Math.min(range, d);
        const lx = hero.x + ((state.mouse.x - hero.x) / d) * travel;
        const ly = hero.y + ((state.mouse.y - hero.y) / d) * travel;
        ctx.strokeStyle = "rgba(111, 220, 95, 0.7)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(hero.x, hero.y);
        ctx.lineTo(lx, ly);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(lx, ly, Sim.ABILITIES.elasticLaunch.radius, 0, Math.PI * 2);
        ctx.stroke();
      } else if (state.time - hero.lastBounceAt < 0.28) {
        // Just landed a bounce: squash, then recover.
        const p = (state.time - hero.lastBounceAt) / 0.28;
        sy = 1 - 0.35 * Math.sin(p * Math.PI);
        sx = 1 + 0.3 * Math.sin(p * Math.PI);
      }

      // The blob himself: green gel with squash and stretch.
      ctx.save();
      ctx.translate(hero.x, hero.y - lift);
      ctx.scale(sx, sy);
      ctx.fillStyle = "#57c84d";
      ctx.beginPath();
      ctx.arc(0, 0, hero.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#2e7d32";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.beginPath();
      ctx.arc(-6, -8, 8, 0, Math.PI * 2);
      ctx.fill();
      // Eyes, glancing toward the mouse.
      const look = Math.atan2(state.mouse.y - hero.y, state.mouse.x - hero.x);
      const lx2 = Math.cos(look) * 3;
      const ly2 = Math.sin(look) * 3;
      [-7, 7].forEach(function (ex) {
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(ex, -4, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#1d2b1a";
        ctx.beginPath();
        ctx.arc(ex + lx2, -4 + ly2, 2.5, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();

      drawBar(hero.x, hero.y - hero.radius - 16, 56, hero.hp / hero.maxHp, "#3fae4a");
      drawBar(hero.x, hero.y - hero.radius - 9, 56, hero.mana / hero.maxMana, "#3a7bd5");
      ctx.fillStyle = "#ffffff";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(hero.name + "  Lv " + hero.level, hero.x, hero.y + hero.radius + 16);
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 30px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        "You died. Respawning in " + Math.ceil(hero.respawnAt - state.time) + "s",
        WORLD / 2,
        WORLD / 2
      );
    }
  }

  // ------------------------------------------------------------ HUD

  const hud = {
    level: document.getElementById("hud-level"),
    gold: document.getElementById("hud-gold"),
    time: document.getElementById("hud-time"),
    hp: document.getElementById("hud-hp"),
    mana: document.getElementById("hud-mana"),
    xp: document.getElementById("hud-xp"),
    abilities: document.getElementById("hud-abilities"),
    buff: document.getElementById("hud-buff"),
  };

  function fmtTime(t) {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function cdText(key, label) {
    const cd = hero.cooldowns[key];
    if (hero.mana < Sim.ABILITIES[key].manaCost && cd <= 0) return label + " (no mana)";
    return cd > 0 ? label + " " + cd.toFixed(1) : label + " ready";
  }

  function updateHud() {
    hud.level.textContent = "Level " + hero.level + "  " + hero.displayName;
    hud.gold.textContent = "Gold " + Math.floor(hero.gold);
    hud.time.textContent = fmtTime(state.time);
    hud.hp.style.width = (100 * hero.hp) / hero.maxHp + "%";
    hud.mana.style.width = (100 * hero.mana) / hero.maxMana + "%";
    const into = hero.xp - Sim.cumulativeXpForLevel(hero.level);
    const needed = Sim.xpToNextLevel(hero.level);
    hud.xp.style.width = (100 * into) / needed + "%";
    const sigilRemaining = Sim.emberSigilRemaining(hero.emberSigilExpiresAt, state.time);
    hud.buff.textContent = sigilRemaining > 0
      ? "Ember Sigil +" +
        Math.round(Sim.EMBER_SIGIL.attackDamageBonusFraction * 100) +
        "% attack damage (" + Math.ceil(sigilRemaining) + "s)"
      : "";
    const qLabel = hero.grab
      ? "Q SLAM!"
      : hero.cooldowns.stretchGrab > 0
        ? "Q Stretch Grab " + hero.cooldowns.stretchGrab.toFixed(1)
        : "Q Stretch Grab ready";
    const eLabel = hero.chargeStart !== null
      ? "E CHARGING " + Math.round(Sim.launchRange(state.time - hero.chargeStart))
      : cdText("elasticLaunch", "E Elastic Launch");
    const passiveLabel = hero.split
      ? "Loose Gel: SPLIT"
      : state.time >= hero.passiveReadyAt
        ? "Loose Gel ready"
        : "Loose Gel " + Math.ceil(hero.passiveReadyAt - state.time) + "s";
    hud.abilities.textContent =
      qLabel + "   |   " +
      cdText("oozeBurst", "W Ooze Burst") + "   |   " +
      eLabel + "   |   " +
      cdText("boingBarrage", "R Boing Barrage") + "   |   " +
      "F Reap " + (hero.cooldowns.reap > 0 ? hero.cooldowns.reap.toFixed(1) : "ready") + "   |   " +
      passiveLabel;
  }

  // ------------------------------------------------------------ input

  function canvasPos(evt) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((evt.clientX - rect.left) / rect.width) * WORLD,
      y: ((evt.clientY - rect.top) / rect.height) * WORLD,
    };
  }

  canvas.addEventListener("mousemove", function (evt) {
    state.mouse = canvasPos(evt);
  });
  canvas.addEventListener("contextmenu", function (evt) {
    evt.preventDefault();
    state.moveTarget = canvasPos(evt);
  });
  window.addEventListener("keydown", function (evt) {
    const k = evt.key.toLowerCase();
    state.keys[k] = true;
    if (k === "q") castAbility("stretchGrab");
    if (k === "w") castAbility("oozeBurst");
    if (k === "e" && !evt.repeat) startCharge(); // hold to charge Elastic Launch
    if (k === "r") castAbility("boingBarrage");
    if (k === "f") castReap();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].indexOf(k) >= 0) evt.preventDefault();
  });
  window.addEventListener("keyup", function (evt) {
    const k = evt.key.toLowerCase();
    state.keys[k] = false;
    if (k === "e") releaseLaunch();
  });

  // ------------------------------------------------------------ main loop

  let lastTs = null;
  function frame(ts) {
    if (lastTs === null) lastTs = ts;
    const dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;
    state.time += dt;
    updateHero(dt);
    updateMinions(dt);
    updateCamps(dt);
    updateTowers(dt);
    updateProjectiles(dt);
    draw();
    updateHud();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
