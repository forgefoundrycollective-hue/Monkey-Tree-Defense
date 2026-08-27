// Core combat mechanics: the aim cone, the stick, the clam, the boss.
import { loadChromium, createRecorder, openGame, quiesce, step, until, placeEnemy } from "./harness.mjs";

export default async function run() {
  const rec = createRecorder("mechanics");
  const chromium = await loadChromium();
  const browser = await chromium.launch();
  try {
    const page = await openGame(browser);
    rec.watch(page);
    const K = await page.evaluate(() => window.__mtd.consts());
    await quiesce(page);

    // --- Aim cone: throws can't go steeply downward, so height creates a
    // blind spot at the trunk base. Aiming straight down must clamp. ---
    const cone = await page.evaluate(() => {
      const G = window.__mtd.G;
      G.monkey.y = G.monkey.y; // no-op, keeps shape obvious
      return null;
    });
    await page.evaluate(k => {
      const G = window.__mtd.G;
      G.monkey.y = k.CLIMB_MIN;          // top of the trunk
      G.monkey.stunT = 0; G.bananaCd = 0;
      G.shots.length = 0;
    }, K);
    // Aim well below the monkey, then throw.
    await page.mouse.move(K.TREE_X + 25, 520);
    await page.evaluate(() => { window.__mtd.G.bananaCd = 0; window.__mtd.throwBanana(); });
    const launch = await page.evaluate(() => {
      const s = window.__mtd.G.shots[0];
      if (!s) return null;
      // undo gravity accumulated since launch to recover the launch angle
      return { deg: Math.atan2(s.vy - s.g * s.t, s.vx) * 180 / Math.PI };
    });
    rec.check("aim cone clamps a straight-down throw to <=21 deg",
      launch && launch.deg <= 21, JSON.stringify(launch));

    // --- Stick: reaches the ground only when the monkey has climbed low ---
    await quiesce(page);
    await placeEnemy(page, { kind: "crab", x: K.TREE_X + 16, y: K.GROUND - 10 });
    await page.evaluate(k => {
      const G = window.__mtd.G;
      G.monkey.y = k.CLIMB_MIN; G.monkey.swingCd = 0; G.monkey.stunT = 0;
    }, K);
    await page.evaluate(() => window.__mtd.swing());
    const high = await page.evaluate(() => window.__mtd.G.enemies.map(e => e.hp));
    rec.check("stick whiffs from the treetop", high[0] === 2, JSON.stringify(high));

    await page.evaluate(k => {
      const G = window.__mtd.G;
      G.monkey.y = k.CLIMB_MAX; G.monkey.swingCd = 0;
    }, K);
    await page.evaluate(() => window.__mtd.swing());
    const low = await page.evaluate(() => ({
      n: window.__mtd.G.enemies.length,
      hp: window.__mtd.G.enemies[0] ? window.__mtd.G.enemies[0].hp : null,
    }));
    rec.check("stick bonks from the trunk base", low.n === 0 || low.hp <= 0, JSON.stringify(low));

    // --- Pinch: a ground attacker next to a low monkey stuns HIM, spares
    // the tree, shoves the attackers back, and can't chain-stun. ---
    await quiesce(page);
    await page.evaluate(k => {
      const G = window.__mtd.G;
      G.monkey.y = k.CLIMB_MAX; G.monkey.stunT = 0; G.monkey.safeT = 0;
      G.tree.hp = G.tree.max;
    }, K);
    await page.evaluate(k => {
      const G = window.__mtd.G;
      const crab = (x, atk) => ({ kind: "crab", side: 1, hp: 2, maxhp: 2, r: 18, vx: -60,
        state: "attack", t: 0, atk, flash: 0, flee: false, bob: 0, x, y: k.GROUND - 10 });
      G.enemies.push(crab(k.TREE_X + 2, 0.01), crab(k.TREE_X + 13, 0.3));
    }, K);
    await step(page, 0.1);
    const pinch = await page.evaluate(k => {
      const G = window.__mtd.G;
      return {
        stunned: G.monkey.stunT > 0,
        safe: G.monkey.safeT > 0,
        treeFull: G.tree.hp === G.tree.max,
        shovedClear: G.enemies.every(e => Math.abs(e.x - k.TREE_X) > 50),
        walking: G.enemies.every(e => e.state === "move"),
      };
    }, K);
    rec.check("pinch stuns the monkey instead of damaging the tree",
      pinch.stunned && pinch.treeFull, JSON.stringify(pinch));
    rec.check("pinch shoves attackers back off the trunk",
      pinch.shovedClear && pinch.walking, JSON.stringify(pinch));

    // run past the stun but stay inside the grace window
    await step(page, 1.0);
    const escaped = await page.evaluate(() => ({
      stunT: window.__mtd.G.monkey.stunT,
      safeT: window.__mtd.G.monkey.safeT,
    }));
    rec.check("stun ends while the no-repinch grace window still holds",
      escaped.stunT === 0 && escaped.safeT > 0, JSON.stringify(escaped));

    // --- Clam: appears on a cleared wave, collected low, banishes a kind ---
    await quiesce(page);
    await page.evaluate(k => {
      const G = window.__mtd.G;
      G.monkey.y = k.CLIMB_MIN; G.monkey.stunT = 0;
      G.heldClam = false; G.clam = null; G.bannedKind = null;
      G.toSpawn = 0; G.waveLull = 0;
      Math.random = () => 0.1;   // force the clam roll on wave clear
    }, K);
    await step(page, 0.1);
    const spawned = await page.evaluate(() => ({ clam: !!window.__mtd.G.clam }));
    rec.check("a clam washes up after a cleared wave", spawned.clam, JSON.stringify(spawned));

    await page.evaluate(k => { window.__mtd.G.monkey.y = k.CLIMB_MAX; }, K);
    await step(page, 0.1);
    const picked = await page.evaluate(() => ({
      clam: !!window.__mtd.G.clam, held: window.__mtd.G.heldClam,
    }));
    rec.check("clam is collected at the trunk base",
      !picked.clam && picked.held, JSON.stringify(picked));

    await page.evaluate(() => {
      const G = window.__mtd.G;
      G.waveLull = 1e9;
      G.enemies.length = 0; G.shots.length = 0; G.squadQueue.length = 0;
      const snake = x => ({ kind: "snake", side: 1, hp: 1, maxhp: 1, r: 17, x, y: 350,
                            vx: -100, state: "move", t: 0, atk: 99, flash: 0, flee: false, bob: 0 });
      // one to hit, plus bystanders of the same and a different species
      G.enemies.push(snake(500), snake(700), snake(820));
      G.enemies.push({ kind: "crab", side: 1, hp: 2, maxhp: 2, r: 18, x: 760, y: 460,
                       vx: -60, state: "move", t: 0, atk: 99, flash: 0, flee: false, bob: 0 });
      G.squadQueue.push({ kind: "snake", delay: 5 }, { kind: "crab", delay: 5 });
      G.heldClam = false;
      G.shots.push({ kind: "clam", x: 470, y: 350, vx: 400, vy: 0, g: 0, r: 14, spin: 0, t: 0 });
    });
    await step(page, 0.3);
    const banished = await page.evaluate(() => {
      const G = window.__mtd.G;
      const snakes = G.enemies.filter(e => e.kind === "snake");
      const crabs = G.enemies.filter(e => e.kind === "crab");
      return {
        banned: G.bannedKind,
        snakesLeft: snakes.length,
        allFleeing: snakes.every(e => e.flee),
        crabUnaffected: crabs.length === 1 && !crabs[0].flee,
        queued: G.squadQueue.map(q => q.kind),
      };
    });
    rec.check("clam kills the one it hits and banishes that species",
      banished.banned === "snake", JSON.stringify(banished));
    rec.check("banished bystanders already on screen turn and flee",
      banished.snakesLeft === 2 && banished.allFleeing, JSON.stringify(banished));
    rec.check("other species carry on unbothered",
      banished.crabUnaffected, JSON.stringify(banished));
    rec.check("a queued squad of the banished species never arrives",
      banished.queued.join(",") === "crab", JSON.stringify(banished.queued));

    // the routed ones actually leave rather than milling about
    await step(page, 6);
    const gone = await page.evaluate(() => ({
      snakes: window.__mtd.G.enemies.filter(e => e.kind === "snake").length,
    }));
    rec.check("routed enemies run right off the beach", gone.snakes === 0, JSON.stringify(gone));

    await page.evaluate(() => { window.__mtd.G.enemies.length = 0; window.__mtd.G.squadQueue.length = 0; });

    const respawn = await page.evaluate(() => {
      const G = window.__mtd.G;
      G.enemies.length = 0;
      G.wave = 6;                       // every kind unlocked
      for (let i = 0; i < 40; i++) window.__mtd.spawnEnemy();
      return { snakes: G.enemies.filter(e => e.kind === "snake").length, banned: G.bannedKind };
    });
    rec.check("banished species never respawns this wave",
      respawn.snakes === 0 && respawn.banned === "snake", JSON.stringify(respawn));

    // --- Boss: arrives on wave 5, heals the tree when felled ---
    await quiesce(page);
    await page.evaluate(() => {
      const G = window.__mtd.G;
      G.bannedKind = null; G.tree.hp = 50;
      window.__mtd.setWave(5);
      G.toSpawn = 0; G.spawnT = 1e9; G.waveLull = 1e9;
      window.__mtd.spawnBoss();
    });
    const boss = await page.evaluate(() => {
      const b = window.__mtd.G.enemies.find(e => e.kind === "boss");
      return { present: !!b, hp: b ? b.hp : null, bossWave: window.__mtd.G.bossWave };
    });
    rec.check("King Pincher spawns on a boss wave with full HP",
      boss.present && boss.hp === 25 && boss.bossWave, JSON.stringify(boss));

    await page.evaluate(() => {
      const G = window.__mtd.G;
      const b = G.enemies.find(e => e.kind === "boss");
      b.hp = 1;
      G.shots.push({ kind: "banana", x: b.x, y: b.y, vx: 1, vy: 0, g: 0, r: 12, spin: 0, t: 0 });
    });
    await step(page, 0.2);
    const felled = await page.evaluate(() => ({
      bosses: window.__mtd.G.enemies.filter(e => e.kind === "boss").length,
      treeHp: window.__mtd.G.tree.hp,
    }));
    rec.check("felling the King heals the tree +30",
      felled.bosses === 0 && felled.treeHp === 80, JSON.stringify(felled));
  } finally {
    await browser.close();
  }
  return rec;
}
