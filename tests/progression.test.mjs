// Wave pacing and the checkpoint restart after losing a tree.
import { loadChromium, createRecorder, openGame, quiesce, step } from "./harness.mjs";

// Loses the current tree and runs the fall → sprint → new-tree sequence
// through to the next playable moment. Stepped rather than waited so the
// result doesn't depend on how long the animation takes in real time.
async function loseTreeAt(page, wave) {
  return page.evaluate(w => {
    const G = window.__mtd.G;
    G.enemies.length = 0; G.shots.length = 0; G.squadQueue.length = 0;
    G.wave = w;
    window.__mtd.forceFall();
    for (let i = 0; i < 60 * 30 && G.state !== "play"; i++) window.__mtd.step(1 / 60);
    G.waveLull = 1e9;   // hold here rather than rolling into the next wave
    return {
      state: G.state,
      wave: G.wave,
      boss: G.enemies.some(e => e.kind === "boss"),
      banned: G.bannedKind,
      bananas: G.bananas,
    };
  }, wave);
}

export default async function run() {
  const rec = createRecorder("progression");
  const chromium = await loadChromium();
  const browser = await chromium.launch();
  try {
    const page = await openGame(browser);
    rec.watch(page);
    await quiesce(page);

    // --- Checkpoints: a new tree resumes at half the wave reached ---
    const from7 = await loseTreeAt(page, 7);
    rec.check("losing on wave 7 restarts at wave 3",
      from7.state === "play" && from7.wave === 3, JSON.stringify(from7));

    const from10 = await loseTreeAt(page, 10);
    rec.check("losing on wave 10 restarts at wave 5, King included",
      from10.state === "play" && from10.wave === 5 && from10.boss, JSON.stringify(from10));

    const from2 = await loseTreeAt(page, 2);
    rec.check("an early loss still restarts at wave 1",
      from2.state === "play" && from2.wave === 1, JSON.stringify(from2));

    // --- A new tree clears per-wave state and refills ammo ---
    await page.evaluate(() => {
      const G = window.__mtd.G;
      G.bannedKind = "crab";
      G.bananas = 1;
    });
    const fresh = await loseTreeAt(page, 6);
    rec.check("a new tree clears the banish and refills the stash",
      fresh.state === "play" && !fresh.banned && fresh.bananas === 6, JSON.stringify(fresh));

    // --- Run summary: snapshot on the fall, cleared on the new tree ---
    await quiesce(page);
    const summary = await page.evaluate(k => {
      const G = window.__mtd.G;
      G.enemies.length = 0; G.shots.length = 0;
      G.wave = 11; G.score = 5000;
      G.upgrades = { bunch: 2 };
      G.treeStats = { kills: 42, bestCombo: 7, scoreAt: 1000, waveAt: 5, t: 96.4 };
      window.__mtd.forceFall();
      const snap = JSON.parse(JSON.stringify(G.summary));
      // run the fall/sprint through to the new tree
      for (let i = 0; i < 60 * 30 && G.state !== "play"; i++) window.__mtd.step(1 / 60);
      G.waveLull = 1e9;
      return { snap, after: G.summary, stats: G.treeStats, state: G.state };
    }, {});
    rec.check("the fall snapshots how that tree went",
      summary.snap.wave === 11 && summary.snap.kills === 42 &&
      summary.snap.bestCombo === 7 && summary.snap.points === 4000 &&
      summary.snap.secs === 96 && summary.snap.next === 5,
      JSON.stringify(summary.snap));
    rec.check("the summary lists the upgrades that run earned",
      Array.isArray(summary.snap.upgrades) && summary.snap.upgrades.length === 1 &&
      /Bunch/.test(summary.snap.upgrades[0]), JSON.stringify(summary.snap.upgrades));
    rec.check("claiming a new tree clears the summary and resets its counters",
      summary.after === null && summary.stats.kills === 0 &&
      summary.stats.bestCombo === 0 && summary.stats.scoreAt === 5000,
      JSON.stringify({ after: summary.after, stats: summary.stats }));

    // kills and combos are actually counted, not just carried
    const counted = await page.evaluate(() => {
      const G = window.__mtd.G;
      G.enemies.length = 0; G.shots.length = 0;
      G.treeStats.kills = 0; G.treeStats.bestCombo = 0; G.combo = 0; G.comboT = 0;
      for (let i = 0; i < 3; i++) {
        G.enemies.push({ kind: "bird", side: 1, hp: 1, maxhp: 1, r: 20, x: 500 + i, y: 300,
          vx: -100, state: "move", t: 0, atk: 99, flash: 0, flee: false, bob: 0 });
        G.shots.push({ kind: "banana", x: 500 + i, y: 300, vx: 10, vy: 0, g: 0, r: 12, spin: 0, t: 0 });
        for (let j = 0; j < 6; j++) window.__mtd.step(1 / 60);
      }
      return { kills: G.treeStats.kills, best: G.treeStats.bestCombo };
    });
    rec.check("kills and best combo are tracked per tree",
      counted.kills === 3 && counted.best === 3, JSON.stringify(counted));

    // --- Wave composition escalates: squads and dives at higher waves ---
    await quiesce(page);
    // (these run the real spawner for several simulated seconds, which would
    // otherwise chew the tree down and end the run mid-assertion — pin its HP
    // so the composition is what's under test, not survival)
    const pressure = await page.evaluate(() => {
      const G = window.__mtd.G;
      window.__mtd.setWave(7);
      G.enemies.length = 0; G.squadQueue.length = 0;
      G.toSpawn = 40; G.interval = 0.05; G.spawnT = 0;
      let sawSquad = false, spawned = 0;
      for (let i = 0; i < 600; i++) {
        G.tree.hp = G.tree.max;
        window.__mtd.step(1 / 60);
        if (G.squadQueue.length) sawSquad = true;
        spawned = Math.max(spawned, G.enemies.length);
      }
      return { sawSquad, spawned, state: G.state };
    });
    rec.check("wave 7 sends squads",
      pressure.sawSquad && pressure.spawned > 0, JSON.stringify(pressure));

    const dives = await page.evaluate(() => {
      const G = window.__mtd.G;
      window.__mtd.setWave(8);
      G.enemies.length = 0; G.squadQueue.length = 0; G.toSpawn = 0; G.spawnT = 1e9;
      G.tree.hp = G.tree.max;
      // put a flock of birds in range of the canopy and let them decide
      const c = window.__mtd.consts().CANOPY;
      for (let i = 0; i < 40; i++) {
        G.enemies.push({ kind: "bird", side: 1, hp: 1, maxhp: 1, r: 20,
          x: c.x + 150 + i, y: c.y - 20, vx: -120, state: "move",
          t: 0, atk: 0, flash: 0, flee: false, bob: 0 });
      }
      for (let i = 0; i < 30; i++) { G.tree.hp = G.tree.max; window.__mtd.step(1 / 60); }
      return {
        dove: G.enemies.some(e => e.diving),
        checked: G.enemies.filter(e => e.diveChecked).length,
        state: G.state,
      };
    });
    rec.check("birds dive-bomb the canopy from wave 6", dives.dove, JSON.stringify(dives));
  } finally {
    await browser.close();
  }
  return rec;
}
