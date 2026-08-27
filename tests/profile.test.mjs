// Cross-run memory: lifetime tallies, medals, and the head starts they grant.
import { loadChromium, createRecorder, openGame, quiesce, step, GAME_URL } from "./harness.mjs";

export default async function run() {
  const rec = createRecorder("profile");
  const chromium = await loadChromium();
  const browser = await chromium.launch();
  try {
    const page = await openGame(browser);
    rec.watch(page);
    const K = await page.evaluate(() => window.__mtd.consts());
    await page.evaluate(() => window.__mtd.resetProfile());
    await quiesce(page);

    // --- a blank profile grants nothing ---
    const blank = await page.evaluate(() => ({
      p: window.__mtd.profile(), perks: window.__mtd.perks(),
      earned: window.__mtd.medals().filter(m => m.earned).length,
    }));
    rec.check("a fresh profile has no medals and no perks",
      blank.earned === 0 && blank.perks.bananas === 0 && blank.perks.treeHp === 0,
      JSON.stringify(blank.perks));

    // --- clearing a wave is remembered ---
    await page.evaluate(() => {
      const G = window.__mtd.G;
      G.enemies.length = 0; G.squadQueue.length = 0; G.toSpawn = 0; G.waveLull = 0;
    });
    await step(page, 0.1);
    const afterWave = await page.evaluate(() => ({
      p: window.__mtd.profile(),
      medals: window.__mtd.medals().filter(m => m.earned).map(m => m.id),
    }));
    rec.check("clearing a wave records it and earns the first medal",
      afterWave.p.waves >= 1 && afterWave.medals.includes("sprout"), JSON.stringify(afterWave.medals));

    // --- kills, Kings, trees and clams all tally ---
    const tallies = await page.evaluate(k => {
      const M = window.__mtd, G = M.G;
      M.resetProfile();
      const before = M.profile();
      G.enemies.length = 0; G.shots.length = 0; G.waveLull = 1e9;
      // a King, felled
      M.setWave(5); M.spawnBoss();
      const b = G.enemies.find(e => e.kind === "boss");
      b.hp = 1;
      G.shots.push({ kind: "banana", x: b.x, y: b.y, vx: 1, vy: 0, g: 0, r: 12, spin: 0, t: 0 });
      for (let i = 0; i < 12; i++) M.step(1 / 60);
      // a clam, thrown
      G.heldClam = true; G.monkey.stunT = 0;
      M.throwClam();
      return { before, after: M.profile() };
    }, K);
    rec.check("felling a King is tallied for the lifetime count",
      tallies.after.kings === 1 && tallies.after.kills > tallies.before.kills,
      JSON.stringify({ kings: tallies.after.kings, kills: tallies.after.kills }));
    rec.check("throwing a clam is tallied",
      tallies.after.clams === 1, JSON.stringify({ clams: tallies.after.clams }));

    // --- medals grant exactly the head start they advertise ---
    const plain = await page.evaluate(() => {
      const M = window.__mtd, G = M.G;
      M.resetProfile();
      G.state = "title"; M.start();
      return { bananas: G.bananas, treeMax: G.tree.max };
    });
    rec.check("a fresh run starts at the base stash and tree HP",
      plain.bananas === K.BANANA_MAX && plain.treeMax === 100, JSON.stringify(plain));

    const granted = await page.evaluate(() => {
      const M = window.__mtd, G = M.G;
      M.resetProfile();
      G.waveLull = 1e9; G.enemies.length = 0; G.shots.length = 0;
      // fell a King for real, so Regicide is earned the way a player earns it
      M.setWave(5);
      M.spawnBoss();
      const b = G.enemies.find(e => e.kind === "boss");
      b.hp = 1;
      G.shots.push({ kind: "banana", x: b.x, y: b.y, vx: 1, vy: 0, g: 0, r: 12, spin: 0, t: 0 });
      for (let i = 0; i < 12; i++) M.step(1 / 60);
      const medals = M.medals().filter(m => m.earned).map(m => m.id);
      const perks = M.perks();
      G.state = "title"; M.start();
      return { medals, perks, bananas: G.bananas, treeMax: G.tree.max };
    });
    rec.check("felling a King earns Regicide and its extra banana",
      granted.medals.includes("king1") && granted.perks.bananas === 1 &&
      granted.bananas === K.BANANA_MAX + 1, JSON.stringify(granted));

    // the medal announces itself rather than appearing silently
    const announced = await page.evaluate(() => {
      const M = window.__mtd, G = M.G;
      M.resetProfile();
      G.medalQueue.length = 0; G.medal = null;
      G.enemies.length = 0; G.squadQueue.length = 0; G.toSpawn = 0; G.waveLull = 0;
      for (let i = 0; i < 12; i++) M.step(1 / 60);
      return { queued: G.medalQueue.length, showing: G.medal && G.medal.m.id };
    });
    rec.check("a newly earned medal is announced on screen",
      announced.showing === "sprout", JSON.stringify(announced));

    // --- the profile survives a reload ---
    // earn something distinctive right before reloading, so this checks
    // persistence rather than whatever an earlier block happened to leave
    await page.evaluate(() => {
      const M = window.__mtd, G = M.G;
      M.resetProfile();
      G.waveLull = 1e9; G.enemies.length = 0; G.shots.length = 0;
      M.setWave(5); M.spawnBoss();
      const b = G.enemies.find(e => e.kind === "boss");
      b.hp = 1;
      G.shots.push({ kind: "banana", x: b.x, y: b.y, vx: 1, vy: 0, g: 0, r: 12, spin: 0, t: 0 });
      for (let i = 0; i < 12; i++) M.step(1 / 60);
    });
    await page.reload();
    await page.waitForFunction(() => !!window.__mtd);
    const reloaded = await page.evaluate(() => ({
      p: window.__mtd.profile(),
      medals: window.__mtd.medals().filter(m => m.earned).map(m => m.id),
    }));
    rec.check("the profile survives a reload",
      reloaded.p.kings === 1 && reloaded.medals.includes("king1"), JSON.stringify(reloaded.medals));

    // --- the pause menu exposes the medals page ---
    const menu = await page.evaluate(() => {
      const M = window.__mtd, G = M.G;
      G.paused = true;
      const labels = M.pauseRows().map(r => r.label);
      const i = labels.indexOf("Medals");
      M.pauseHit(480, 182 + i * (42 + 9) + 20);
      const page1 = M.pausePage();
      M.pauseHit(480, 540 - 72 + 20);
      const page2 = M.pausePage();
      G.paused = false;
      return { labels, page1, page2 };
    });
    rec.check("a Medals page is reachable from the pause menu",
      menu.labels.includes("Medals") && menu.page1 === "medals" && menu.page2 === "menu",
      JSON.stringify(menu));

    // --- resetting wipes it ---
    const wiped = await page.evaluate(() => {
      window.__mtd.resetProfile();
      return { p: window.__mtd.profile(), earned: window.__mtd.medals().filter(m => m.earned).length };
    });
    rec.check("resetting the profile clears everything",
      wiped.earned === 0 && wiped.p.kings === 0 && wiped.p.runs === 0, JSON.stringify(wiped.p));
  } finally {
    await browser.close();
  }
  return rec;
}
