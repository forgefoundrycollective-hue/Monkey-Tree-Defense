// Music layering. Unlike the other suites this one must run against the live
// animation loop in real time: the Web Audio ramps are scheduled on the
// AudioContext clock, which simulated stepping does not advance.
import { loadChromium, createRecorder, openGame } from "./harness.mjs";

const audio = page => page.evaluate(() => window.__mtd.audio());
const settle = ms => new Promise(r => setTimeout(r, ms));

// Keeps the run alive and quiet without freezing the loop the ramps need.
async function calm(page) {
  await page.evaluate(() => {
    const G = window.__mtd.G;
    G.toSpawn = 0; G.spawnT = 1e9; G.waveLull = 1e9;
    G.enemies.length = 0; G.shots.length = 0; G.squadQueue.length = 0;
    G.tree.hp = G.tree.max;
  });
}

export default async function run() {
  const rec = createRecorder("audio");
  const chromium = await loadChromium();
  // headless Chromium won't start an AudioContext without this
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  try {
    const page = await openGame(browser);
    rec.watch(page);
    await calm(page);

    const base = await audio(page);
    rec.check("the audio graph comes up with both layers",
      base.ready && base.bossLayer === 0 && base.filterHz === 20000 && base.bossRate !== null,
      JSON.stringify(base));

    // --- King Pincher fades a threat in underneath the melody ---
    await page.evaluate(() => { window.__mtd.G.enemies.length = 0; window.__mtd.spawnBoss(); });
    await settle(1800);
    const withBoss = await audio(page);
    rec.check("the King fades in the low layer",
      withBoss.bossLayer > 0.4, JSON.stringify(withBoss));

    await page.evaluate(() => { window.__mtd.G.enemies.length = 0; });
    await settle(2800);
    const afterBoss = await audio(page);
    rec.check("felling the King fades the layer back out",
      afterBoss.bossLayer < 0.05, JSON.stringify(afterBoss));

    // --- Night muffles the tune ---
    await page.evaluate(() => {
      const G = window.__mtd.G;
      G.modifier = { id: "night", name: "NIGHTFALL", sub: "" };
    });
    await settle(2500);
    const night = await audio(page);
    rec.check("night closes the lowpass over the music",
      night.filterHz < 8000, JSON.stringify(night));

    await page.evaluate(() => { window.__mtd.G.modifier = null; });
    await settle(2500);
    const day = await audio(page);
    rec.check("daybreak opens the filter again",
      day.filterHz > 15000, JSON.stringify(day));

    // --- Tempo drives both layers so they stay phase-locked ---
    await page.evaluate(() => window.__mtd.setWave(11));
    await calm(page);
    await settle(1800);
    const fast = await audio(page);
    rec.check("later waves speed up both music layers together",
      fast.rate > 1.2 && Math.abs(fast.rate - fast.bossRate) < 0.02, JSON.stringify(fast));
  } finally {
    await browser.close();
  }
  return rec;
}
