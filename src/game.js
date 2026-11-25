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
  // mirror of blue side camps through the map centre.
  const CAMP_DEFS = [
    { id: "blue-buff", name: "Crimson Brute", kind: "buff", x: 420, y: 1080, monsters: 1, monsterHp: 950, monsterDamage: 22, gold: 90, xp: 120 },
    { id: "blue-wolves", name: "Ember Wolves", kind: "small", x: 300, y: 900, monsters: 2, monsterHp: 520, monsterDamage: 11, gold: 70, xp: 95 },
    { id: "blue-golems", name: "Stone Golems", kind: "small", x: 560, y: 1240, monsters: 2, monsterHp: 640, monsterDamage: 13, gold: 75, xp: 100 },
    { id: "blue-thorn", name: "Thornbacks", kind: "small", x: 700, y: 950, monsters: 2, monsterHp: 480, monsterDamage: 12, gold: 65, xp: 90 },
    { id: "red-buff", name: "Crimson Brute", kind: "buff", x: 1080, y: 420, monsters: 1, monsterHp: 950, monsterDamage: 22, gold: 90, xp: 120 },
    { id: "red-wolves", name: "Ember Wolves", kind: "small", x: 1200, y: 600, monsters: 2, monsterHp: 520, monsterDamage: 11, gold: 70, xp: 95 },
    { id: "red-golems", name: "Stone Golems", kind: "small", x: 940, y: 260, monsters: 2, monsterHp: 640, monsterDamage: 13, gold: 75, xp: 100 },
    { id: "red-thorn", name: "Thornbacks", kind: "small", x: 800, y: 550, monsters: 2, monsterHp: 480, monsterDamage: 12, gold: 65, xp: 90 },
  ];

  // ------------------------------------------------------------ state

  const state = {
    time: 0,
    lastWaveAt: -15, // first wave spawns at t = 15
    waveCount: 0,
    minions: [],
    projectiles: [],
    camps: [],
    keys: {},
    mouse: { x: 750, y: 750 },
    moveTarget: null,
    gameOver: false,
  };

  const hero = {
    name: "Korrin",
    x: BLUE_BASE.x + 60,
    y: BLUE_BASE.y - 60,
    radius: 20,
    maxHp: 620,
    hp: 620,
    maxMana: 320,
    mana: 320,
    baseAd: 64,
    bonusAd: 0,
    ap: 0,
    armor: 28,
    magicResist: 30,
    moveSpeed: 335,
    attackRange: 185,
    attackCooldown: 0,
    attackPeriod: 0.85,
    xp: 0,
    level: 1,
    gold: 475,
    kills: 0,
    deaths: 0,
    dead: false,
    respawnAt: 0,
    rootUntil: 0,
    cooldowns: { briarLash: 0, rootSnare: 0, thornDash: 0, verdantCataclysm: 0, reap: 0 },
  };

  function heroAttackDamage() {
    return hero.baseAd + hero.bonusAd + (hero.level - 1) * 4;
  }

  // Camps pair Sim camp state with live monster units.
  state.camps = CAMP_DEFS.map(function (def) {
    return {
      def: def,
      sim: Sim.createCamp(def.kind),
      monsters: [],
    };
  });

  function spawnCampMonsters(camp) {
    camp.monsters = [];
    for (let i = 0; i < camp.def.monsters; i += 1) {
      const angle = (i / Math.max(1, camp.def.monsters)) * Math.PI * 2;
      const offset = camp.def.monsters === 1 ? 0 : 34;
      camp.monsters.push({
        camp: camp,
        x: camp.def.x + Math.cos(angle) * offset,
        y: camp.def.y + Math.sin(angle) * offset,
        homeX: camp.def.x + Math.cos(angle) * offset,
        homeY: camp.def.y + Math.sin(angle) * offset,
        radius: camp.def.kind === "buff" ? 24 : 17,
        maxHp: camp.def.monsterHp,
        hp: camp.def.monsterHp,
        damage: camp.def.monsterDamage,
        attackCooldown: 0,
        rootUntil: 0,
        alive: true,
        lastAttacker: null,
      });
    }
  }
  state.camps.forEach(spawnCampMonsters);

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

  function isRooted(unit) {
    return state.time < unit.rootUntil;
  }

  function damageUnit(unit, amount, attacker) {
    unit.hp -= amount;
    unit.lastAttacker = attacker;
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

  const MINION_STATS = {
    melee: { hp: 480, damage: 11, range: 105, radius: 13, speed: 105 },
    caster: { hp: 290, damage: 16, range: 280, radius: 12, speed: 105 },
    siege: { hp: 850, damage: 22, range: 120, radius: 17, speed: 95 },
  };

  function spawnWave() {
    state.waveCount += 1;
    const kinds = ["melee", "melee", "melee", "caster", "caster", "caster"];
    if (state.waveCount % 3 === 0) kinds.push("siege");
    ["blue", "red"].forEach(function (team) {
      const path = team === "blue" ? LANES.mid : LANES.mid.slice().reverse();
      kinds.forEach(function (kind, i) {
        const s = MINION_STATS[kind];
        state.minions.push({
          team: team,
          kind: kind,
          x: path[0].x + (i % 3) * 26 - 26,
          y: path[0].y + Math.floor(i / 3) * 26 - 13,
          radius: s.radius,
          maxHp: s.hp,
          hp: s.hp,
          damage: s.damage,
          range: s.range,
          speed: s.speed,
          path: path,
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
    // The hero is a valid target for red minions.
    if (m.team === "red" && !hero.dead) {
      const d = dist(m, hero);
      if (d < bestD) {
        best = hero;
        bestD = d;
      }
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
      const found = nearestEnemyMinion(m);
      if (found.unit && found.distance <= m.range + found.unit.radius) {
        if (m.attackCooldown <= 0) {
          m.attackCooldown = 1.1;
          damageUnit(found.unit, m.damage, m);
        }
        return;
      }
      if (found.unit && found.distance <= 300) {
        if (!isRooted(m)) moveToward(m, found.unit, m.speed, dt);
        return;
      }
      const wp = m.path[m.waypoint];
      if (!wp) return;
      if (!isRooted(m)) moveToward(m, wp, m.speed, dt);
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
          const engaged = dist(hero, camp.def) < 340 && !hero.dead;
          if (engaged) {
            if (dist(mon, hero) <= mon.radius + hero.radius + 26) {
              if (mon.attackCooldown <= 0) {
                mon.attackCooldown = 1.2;
                const dealt = Sim.mitigatePhysical(mon.damage, hero.armor);
                hero.hp -= dealt;
              }
            } else if (!isRooted(mon)) {
              moveToward(mon, hero, 165, dt);
            }
          } else if (dist(mon, { x: mon.homeX, y: mon.homeY }) > 4 && !isRooted(mon)) {
            moveToward(mon, { x: mon.homeX, y: mon.homeY }, 120, dt);
            mon.hp = Math.min(mon.maxHp, mon.hp + mon.maxHp * 0.08 * dt);
          }
        }
      });
      if (allDead) {
        Sim.clearCamp(camp.sim, state.time);
        hero.gold += camp.def.gold;
        gainXp(camp.def.xp);
      }
    });
  }

  // ------------------------------------------------------------ hero

  function castAbility(key) {
    if (hero.dead) return;
    const def = Sim.ABILITIES[key];
    if (hero.cooldowns[key] > 0 || hero.mana < def.manaCost) return;
    hero.mana -= def.manaCost;
    hero.cooldowns[key] = def.cooldown;
    const rank = key === "verdantCataclysm" ? Math.max(1, Math.floor(hero.level / 6)) : Math.min(5, Math.ceil(hero.level / 2));
    const aim = { x: state.mouse.x, y: state.mouse.y };

    if (key === "briarLash") {
      const d = Math.max(1, dist(hero, aim));
      state.projectiles.push({
        x: hero.x,
        y: hero.y,
        vx: ((aim.x - hero.x) / d) * 720,
        vy: ((aim.y - hero.y) / d) * 720,
        radius: 9,
        life: 0.75,
        damage: Sim.abilityDamage(key, rank, hero.bonusAd, hero.ap, { armor: 0, magicResist: 0 }),
        damageKey: key,
        rank: rank,
      });
    } else if (key === "rootSnare") {
      const radius = 165;
      enemiesInRadius(aim, radius).forEach(function (u) {
        damageUnit(u, Sim.abilityDamage(key, rank, hero.bonusAd, hero.ap, u), hero);
        u.rootUntil = state.time + def.rootSeconds[rank - 1];
      });
      state.projectiles.push({ x: aim.x, y: aim.y, vx: 0, vy: 0, radius: radius, life: 0.25, ringOnly: true });
    } else if (key === "thornDash") {
      const d = Math.max(1, dist(hero, aim));
      const range = Math.min(def.dashRange, d);
      hero.x += ((aim.x - hero.x) / d) * range;
      hero.y += ((aim.y - hero.y) / d) * range;
      enemiesInRadius(hero, 130).forEach(function (u) {
        damageUnit(u, Sim.abilityDamage(key, rank, hero.bonusAd, hero.ap, u), hero);
      });
    } else if (key === "verdantCataclysm") {
      enemiesInRadius(hero, 330).forEach(function (u) {
        damageUnit(u, Sim.abilityDamage(key, rank, hero.bonusAd, hero.ap, u), hero);
      });
      state.projectiles.push({ x: hero.x, y: hero.y, vx: 0, vy: 0, radius: 330, life: 0.35, ringOnly: true });
    }
  }

  function castReap() {
    if (hero.dead || hero.cooldowns.reap > 0) return;
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
        hero.x = BLUE_BASE.x + 60;
        hero.y = BLUE_BASE.y - 60;
      }
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

    // Movement: arrow keys override click-to-move. (Letters are reserved
    // for abilities, so WASD movement is deliberately not used.)
    let vx = 0;
    let vy = 0;
    if (state.keys["arrowup"]) vy -= 1;
    if (state.keys["arrowdown"]) vy += 1;
    if (state.keys["arrowleft"]) vx -= 1;
    if (state.keys["arrowright"]) vx += 1;
    if ((vx !== 0 || vy !== 0) && !isRooted(hero)) {
      const len = Math.sqrt(vx * vx + vy * vy);
      hero.x += (vx / len) * hero.moveSpeed * dt;
      hero.y += (vy / len) * hero.moveSpeed * dt;
      state.moveTarget = null;
    } else if (state.moveTarget && !isRooted(hero)) {
      moveToward(hero, state.moveTarget, hero.moveSpeed, dt);
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
    if (target && targetD <= hero.attackRange + target.radius && hero.attackCooldown <= 0) {
      hero.attackCooldown = hero.attackPeriod;
      const armor = target.armor === undefined ? 10 : target.armor;
      damageUnit(target, Sim.mitigatePhysical(heroAttackDamage(), armor), hero);
    }

    if (hero.hp <= 0) {
      hero.dead = true;
      hero.deaths += 1;
      hero.respawnAt = state.time + 5 + hero.level * 0.5;
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
        damageUnit(u, Sim.abilityDamage(p.damageKey, p.rank, hero.bonusAd, hero.ap, u), hero);
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
        ctx.fillStyle = camp.def.kind === "buff" ? "#b3541e" : "#7a6a53";
        ctx.beginPath();
        ctx.arc(mon.x, mon.y, mon.radius, 0, Math.PI * 2);
        ctx.fill();
        drawBar(mon.x, mon.y - mon.radius - 12, 44, mon.hp / mon.maxHp, "#c0392b");
      });
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

    // Hero.
    if (!hero.dead) {
      ctx.fillStyle = "#f2c14e";
      ctx.beginPath();
      ctx.arc(hero.x, hero.y, hero.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#fff7dd";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = "#1d2b1a";
      ctx.font = "bold 13px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(hero.level + "", hero.x, hero.y + 5);
      drawBar(hero.x, hero.y - hero.radius - 16, 56, hero.hp / hero.maxHp, "#3fae4a");
      drawBar(hero.x, hero.y - hero.radius - 9, 56, hero.mana / hero.maxMana, "#3a7bd5");
      ctx.fillStyle = "#ffffff";
      ctx.font = "12px sans-serif";
      ctx.fillText(hero.name, hero.x, hero.y + hero.radius + 16);
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
    hud.level.textContent = "Level " + hero.level + "  Korrin, the Briar Knight";
    hud.gold.textContent = "Gold " + Math.floor(hero.gold);
    hud.time.textContent = fmtTime(state.time);
    hud.hp.style.width = (100 * hero.hp) / hero.maxHp + "%";
    hud.mana.style.width = (100 * hero.mana) / hero.maxMana + "%";
    const into = hero.xp - Sim.cumulativeXpForLevel(hero.level);
    const needed = Sim.xpToNextLevel(hero.level);
    hud.xp.style.width = (100 * into) / needed + "%";
    hud.abilities.textContent =
      cdText("briarLash", "Q Briar Lash") + "   |   " +
      cdText("rootSnare", "W Root Snare") + "   |   " +
      cdText("thornDash", "E Thorn Dash") + "   |   " +
      cdText("verdantCataclysm", "R Verdant Cataclysm") + "   |   " +
      "F Reap " + (hero.cooldowns.reap > 0 ? hero.cooldowns.reap.toFixed(1) : "ready");
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
    if (k === "q") castAbility("briarLash");
    if (k === "w") castAbility("rootSnare");
    if (k === "e") castAbility("thornDash");
    if (k === "r") castAbility("verdantCataclysm");
    if (k === "f") castReap();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].indexOf(k) >= 0) evt.preventDefault();
  });
  window.addEventListener("keyup", function (evt) {
    state.keys[evt.key.toLowerCase()] = false;
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
    updateProjectiles(dt);
    draw();
    updateHud();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
