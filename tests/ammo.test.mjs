// The banana stash: spam control, regrow pacing, and refills.
import { loadChromium, createRecorder, openGame, quiesce, step } from "./harness.mjs";

export default async function run() {
  const rec = createRecorder("ammo");
  const chromium = await loadChromium();
  const browser = await chromium.launch();
  try {
    const page = await openGame(browser);
    rec.watch(page);
    const K = await page.evaluate(() => window.__mtd.consts());
    await quiesce(page);

    // --- Spam: mashing throw can never exceed the stash. Bypass the
    // per-shot cooldown so the STASH is what's under test. ---
    const spam = await page.evaluate(() => {
      const G = window.__mtd.G;
      G.shots.length = 0; G.monkey.stunT = 0;
      let thrown = 0;
      for (let i = 0; i < 50; i++) {
        G.bananaCd = 0;
        const before = G.shots.length;
        window.__mtd.throwBanana();
        if (G.shots.length > before) thrown++;
      }
      return { thrown, bananas: G.bananas };
    });
    rec.check(`50 throw attempts yield only ${K.BANANA_MAX} shots`,
      spam.thrown === K.BANANA_MAX && spam.bananas === 0, JSON.stringify(spam));

    // --- Empty: a dry throw produces nothing and flags the HUD flash ---
    const dry = await page.evaluate(() => {
      const G = window.__mtd.G;
      const before = G.shots.length;
      G.bananaCd = 0; G.bananaFlash = 0;
      window.__mtd.throwBanana();
      return { grew: G.shots.length > before, flash: G.bananaFlash > 0, bananas: G.bananas };
    });
    rec.check("throwing on an empty stash does nothing but flash",
      !dry.grew && dry.flash && dry.bananas === 0, JSON.stringify(dry));

    // --- Regrow pacing: the clock restarts on the last spend, so there is
    // no free instant refill, then one banana returns per interval. ---
    const pacing = await page.evaluate(k => {
      const G = window.__mtd.G;
      const trace = { start: G.bananas };
      const stepsPerBanana = Math.round(k.BANANA_REGROW * 60);
      for (let i = 0; i < stepsPerBanana - 4; i++) window.__mtd.step(1 / 60);
      trace.justBefore = G.bananas;          // still short of one interval
      for (let i = 0; i < 8; i++) window.__mtd.step(1 / 60);
      trace.afterOne = G.bananas;            // one interval elapsed
      for (let i = 0; i < stepsPerBanana * k.BANANA_MAX; i++) window.__mtd.step(1 / 60);
      trace.afterAll = G.bananas;
      return trace;
    }, K);
    rec.check("no instant regrow before a full interval elapses",
      pacing.start === 0 && pacing.justBefore === 0, JSON.stringify(pacing));
    rec.check("one banana regrows per interval",
      pacing.afterOne === 1, JSON.stringify(pacing));
    rec.check("the stash refills to full and stops there",
      pacing.afterAll === K.BANANA_MAX, JSON.stringify(pacing));

    // --- The per-shot cooldown still gates rapid real clicks ---
    await page.evaluate(() => {
      const G = window.__mtd.G;
      G.shots.length = 0; G.bananaCd = 0;
      window.__mtd.throwBanana();
      window.__mtd.throwBanana();   // immediately after: cooldown should block
    });
    const gated = await page.evaluate(() => window.__mtd.G.shots.length);
    rec.check("per-shot cooldown still gates back-to-back throws", gated === 1, "shots=" + gated);

    // --- Refills on wave clear ---
    await page.evaluate(() => {
      const G = window.__mtd.G;
      G.bananas = 2; G.bananaRegrow = 1e9;
      G.enemies.length = 0; G.squadQueue.length = 0; G.toSpawn = 0; G.waveLull = 0;
    });
    await step(page, 0.1);
    const cleared = await page.evaluate(() => window.__mtd.G.bananas);
    rec.check("clearing a wave refills the stash", cleared === K.BANANA_MAX, "bananas=" + cleared);
  } finally {
    await browser.close();
  }
  return rec;
}
