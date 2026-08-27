// Wave 8+ content: the thieving gull, the armored hermit, wave modifiers.
import { loadChromium, createRecorder, openGame, quiesce, step } from "./harness.mjs";

export default async function run() {
  const rec = createRecorder("lategame");
  const chromium = await loadChromium();
  const browser = await chromium.launch();
  try {
    const page = await openGame(browser);
    rec.watch(page);
    const K = await page.evaluate(() => window.__mtd.consts());
    await quiesce(page);

    // --- Unlock gating: new kinds only appear once their wave arrives ---
    const unlocks = await page.evaluate(() => {
      const G = window.__mtd.G;
      const seenAt = w => {
        window.__mtd.setWave(w);
        G.enemies.length = 0; G.spawnT = 1e9; G.toSpawn = 0;
        const kinds = new Set();
        for (let i = 0; i < 400; i++) { G.enemies.length = 0; window.__mtd.spawnEnemy(); if (G.enemies[0]) kinds.add(G.enemies[0].kind); }
        return [...kinds];
      };
      return { w6: seenAt(6), w8: seenAt(8), w9: seenAt(9) };
    });
    rec.check("hermit and gull stay locked before wave 8",
      !unlocks.w6.includes("hermit") && !unlocks.w6.includes("gull"), JSON.stringify(unlocks.w6));
    rec.check("hermit unlocks at wave 8", unlocks.w8.includes("hermit"), JSON.stringify(unlocks.w8));
    rec.check("gull unlocks at wave 9", unlocks.w9.includes("gull"), JSON.stringify(unlocks.w9));

    // --- Armored hermit: bananas clank off, coconuts and the stick work ---
    await quiesce(page);
    const armor = await page.evaluate(k => {
      const G = window.__mtd.G, M = window.__mtd;
      const putHermit = () => {
        G.enemies.length = 0; G.shots.length = 0;
        G.enemies.push({ kind: "hermit", side: 1, hp: 4, maxhp: 4, r: 21, armored: true,
          x: 600, y: k.GROUND - 10, vx: 0, state: "move", t: 0, atk: 99, flash: 0, flee: false, bob: 0 });
      };
      putHermit();
      G.shots.push({ kind: "banana", x: 590, y: k.GROUND - 10, vx: 400, vy: 0, g: 0, r: 12, spin: 0, t: 0 });
      for (let i = 0; i < 12; i++) M.step(1 / 60);
      const afterBanana = G.enemies[0] ? G.enemies[0].hp : 0;

      putHermit();
      G.shots.push({ kind: "coco", x: 590, y: k.GROUND - 10, vx: 400, vy: 0, g: 0, r: 14, spin: 0, t: 0, bounced: false });
      for (let i = 0; i < 12; i++) M.step(1 / 60);
      const afterCoco = G.enemies[0] ? G.enemies[0].hp : 0;

      putHermit();
      G.enemies[0].x = G.monkey.x + 30; G.enemies[0].y = G.monkey.y;
      G.monkey.swingCd = 0; G.monkey.stunT = 0;
      M.swing();
      const afterStick = G.enemies[0] ? G.enemies[0].hp : 0;
      return { afterBanana, afterCoco, afterStick };
    }, K);
    rec.check("bananas clank off the hermit's shell", armor.afterBanana === 4, JSON.stringify(armor));
    rec.check("coconuts punch through the shell", armor.afterCoco < 4, JSON.stringify(armor));
    rec.check("the stick punches through the shell", armor.afterStick < 4, JSON.stringify(armor));

    // --- Gull: robs the stash, flees, and stays shootable to win it back ---
    await quiesce(page);
    const theft = await page.evaluate(k => {
      const G = window.__mtd.G, M = window.__mtd;
      G.enemies.length = 0; G.shots.length = 0;
      G.bananas = 6; G.monkey.stunT = 0;
      G.tree.hp = G.tree.max;
      G.enemies.push({ kind: "gull", side: 1, hp: 1, maxhp: 1, r: 19, thief: true, loot: 0,
        x: G.monkey.x + 40, y: G.monkey.y - 16, vx: -200, state: "move",
        t: 0, atk: 0, flash: 0, flee: false, bob: 0 });
      for (let i = 0; i < 40; i++) M.step(1 / 60);
      const g = G.enemies[0];
      const robbed = { bananas: G.bananas, fleeing: g ? g.flee : null, loot: g ? g.loot : null,
                       treeIntact: G.tree.hp === G.tree.max };
      // now shoot the fleeing thief down
      if (g) {
        G.shots.push({ kind: "banana", x: g.x - 8, y: g.y, vx: 600, vy: 0, g: 0, r: 12, spin: 0, t: 0 });
        for (let i = 0; i < 20; i++) M.step(1 / 60);
      }
      return { ...robbed, recovered: G.bananas };
    }, K);
    rec.check("a gull robs bananas rather than damaging the tree",
      theft.bananas === 3 && theft.loot === 3 && theft.fleeing && theft.treeIntact, JSON.stringify(theft));
    rec.check("shooting the fleeing thief returns the loot",
      theft.recovered === 6, JSON.stringify(theft));

    const emptyRob = await page.evaluate(() => {
      const G = window.__mtd.G, M = window.__mtd;
      G.enemies.length = 0; G.shots.length = 0; G.bananas = 0;
      G.enemies.push({ kind: "gull", side: 1, hp: 1, maxhp: 1, r: 19, thief: true, loot: 0,
        x: G.monkey.x + 40, y: G.monkey.y - 16, vx: -200, state: "move",
        t: 0, atk: 0, flash: 0, flee: false, bob: 0 });
      for (let i = 0; i < 40; i++) M.step(1 / 60);
      const g = G.enemies[0];
      return { bananas: G.bananas, fleeing: g ? g.flee : null, loot: g ? g.loot : null };
    });
    rec.check("robbing an empty stash can't go negative",
      emptyRob.bananas === 0 && emptyRob.loot === 0 && emptyRob.fleeing, JSON.stringify(emptyRob));

    // --- Wave modifiers ---
    const mods = await page.evaluate(() => {
      const G = window.__mtd.G;
      const seen = new Set();
      let earlyModifier = false;
      for (let w = 1; w <= 7; w++) {
        for (let i = 0; i < 60; i++) { window.__mtd.setWave(w); if (G.modifier) earlyModifier = true; }
      }
      for (let i = 0; i < 400; i++) {
        window.__mtd.setWave(8 + (i % 3) + (i % 3 === 2 ? 1 : 0));  // skip multiples of 5
        if (G.modifier) seen.add(G.modifier.id);
      }
      let bossModifier = false;
      for (let i = 0; i < 200; i++) { window.__mtd.setWave(10); if (G.modifier) bossModifier = true; }
      window.__mtd.setWave(1);
      return { earlyModifier, seen: [...seen].sort(), bossModifier, windCleared: G.wind };
    });
    rec.check("no modifiers before wave 8", !mods.earlyModifier, JSON.stringify(mods));
    rec.check("all three modifiers can appear from wave 8",
      mods.seen.join(",") === "night,swarm,windy", JSON.stringify(mods.seen));
    rec.check("King waves are never modified", !mods.bossModifier, JSON.stringify(mods));
    rec.check("leaving a windy wave clears the wind", mods.windCleared === 0, JSON.stringify(mods));

    // --- Wind actually bends a throw, and the preview agrees ---
    const wind = await page.evaluate(k => {
      const G = window.__mtd.G, M = window.__mtd;
      const flightX = w => {
        G.wind = w;
        G.shots.length = 0;
        G.shots.push({ kind: "banana", x: 300, y: 200, vx: 0, vy: 0, g: 0, r: 12, spin: 0, t: 0 });
        for (let i = 0; i < 60; i++) M.step(1 / 60);
        return G.shots[0] ? Math.round(G.shots[0].x) : null;
      };
      const still = flightX(0), blown = flightX(240);
      G.wind = 0; G.shots.length = 0;
      return { still, blown };
    }, K);
    rec.check("wind pushes shots sideways in flight",
      wind.blown > wind.still + 50, JSON.stringify(wind));

    // --- Swarm sends materially more attackers ---
    const swarm = await page.evaluate(() => {
      const G = window.__mtd.G;
      let plain = 0, swarmed = 0;
      for (let i = 0; i < 200; i++) {
        window.__mtd.setWave(8);
        if (G.modifier && G.modifier.id === "swarm") swarmed = Math.max(swarmed, G.toSpawn);
        else if (!G.modifier) plain = Math.max(plain, G.toSpawn);
      }
      window.__mtd.setWave(1);
      return { plain, swarmed };
    });
    rec.check("a swarm wave sends more attackers than a plain one",
      swarm.swarmed > swarm.plain, JSON.stringify(swarm));
  } finally {
    await browser.close();
  }
  return rec;
}
