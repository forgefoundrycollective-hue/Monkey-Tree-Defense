// Regression: the monkey must never become unable to climb.
//
// Reported from play: climbing all the way down to the sand and then being
// unable to get back up. Root cause was a key held when the page lost focus —
// its keyup never arrives, and since climbing summed up-and-down into one
// delta, a stuck "down" cancelled every later "up" and pinned the monkey.
import { loadChromium, createRecorder, openGame, quiesce, step } from "./harness.mjs";

export default async function run() {
  const rec = createRecorder("stuck");
  const chromium = await loadChromium();
  const browser = await chromium.launch();
  try {
    const page = await openGame(browser);
    rec.watch(page);
    const K = await page.evaluate(() => window.__mtd.consts());
    await quiesce(page);

    // --- the exact reported sequence ---
    await page.evaluate(k => {
      const G = window.__mtd.G;
      G.monkey.y = k.CLIMB_MIN; G.monkey.stunT = 0; G.monkey.safeT = 0;
    }, K);
    await page.keyboard.down("s");                 // ride it all the way down
    await step(page, 1.5);
    const atSand = await page.evaluate(() => window.__mtd.G.monkey.y);
    rec.check("holding down reaches the sand", Math.round(atSand) === Math.round(K.CLIMB_MAX),
      "y=" + Math.round(atSand));

    // focus leaves while the key is still down: the keyup never arrives
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    const afterBlur = await page.evaluate(() => window.__mtd.input());
    rec.check("losing focus releases every held input",
      afterBlur.keys.length === 0 && !afterBlur.lmb, JSON.stringify(afterBlur));

    // ...and the player can climb again
    await page.keyboard.up("s").catch(() => {});
    await page.keyboard.down("w");
    await step(page, 1.0);
    await page.keyboard.up("w");
    const climbed = await page.evaluate(() => window.__mtd.G.monkey.y);
    rec.check("the monkey climbs back up after regaining focus",
      climbed < atSand - 100, `y ${Math.round(atSand)} -> ${Math.round(climbed)}`);

    // --- and even with a genuinely stuck key, movement still resolves ---
    const jammed = await page.evaluate(k => {
      const M = window.__mtd, G = M.G;
      G.monkey.y = k.CLIMB_MAX; G.monkey.stunT = 0;
      // simulate a "down" that never got its keyup
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyS" }));
      const before = G.monkey.y;
      // now the player asks to go up
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
      for (let i = 0; i < 60; i++) M.step(1 / 60);
      const after = G.monkey.y;
      window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyS" }));
      window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW" }));
      return { before, after };
    }, K);
    rec.check("a stuck direction can't cancel the one you're asking for",
      jammed.after < jammed.before - 100,
      `y ${Math.round(jammed.before)} -> ${Math.round(jammed.after)}`);

    // --- the same for a stuck on-screen button ---
    const stuckBtn = await page.evaluate(k => {
      const M = window.__mtd, G = M.G;
      G.monkey.y = k.CLIMB_MAX; G.monkey.stunT = 0;
      M.touchButtonHit(62, 540 - 46, true);        // hold the "down" button
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
      for (let i = 0; i < 60; i++) M.step(1 / 60);
      const after = G.monkey.y;
      window.dispatchEvent(new Event("blur"));
      return { after, held: M.input().held };
    }, K);
    rec.check("a stuck on-screen button can't trap the monkey either",
      stuckBtn.after < K.CLIMB_MAX - 100, JSON.stringify(stuckBtn));

    // --- hiding the tab releases inputs too ---
    const hidden = await page.evaluate(() => {
      const M = window.__mtd;
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyS" }));
      M.G.mouseLmbProbe = true;
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      document.dispatchEvent(new Event("visibilitychange"));
      const after = M.input();
      Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
      return after;
    });
    rec.check("hiding the tab releases held inputs",
      hidden.keys.length === 0, JSON.stringify(hidden));

    // --- a stun still ends on its own; it must never be permanent ---
    const stun = await page.evaluate(k => {
      const M = window.__mtd, G = M.G;
      G.monkey.y = k.CLIMB_MAX; G.monkey.stunT = 0; G.monkey.safeT = 0;
      G.tree.hp = G.tree.max;
      G.enemies.length = 0;
      // a full crowd of ground attackers, all pinching as fast as they can
      for (let i = 0; i < 8; i++)
        G.enemies.push({ kind: "crab", side: 1, hp: 99, maxhp: 99, r: 18,
          x: k.TREE_X + (i - 4) * 6, y: k.GROUND - 10, vx: 0, state: "attack",
          t: 0, atk: 0.01, flash: 0, flee: false, bob: 0 });
      let stunnedFrames = 0, freeFrames = 0;
      for (let i = 0; i < 60 * 10; i++) {
        G.tree.hp = G.tree.max;
        M.step(1 / 60);
        if (G.monkey.stunT > 0) stunnedFrames++; else freeFrames++;
      }
      G.enemies.length = 0;
      return { stunnedFrames, freeFrames };
    }, K);
    rec.check("even swarmed at the base, the monkey is free more often than stunned",
      stun.freeFrames > stun.stunnedFrames, JSON.stringify(stun));
  } finally {
    await browser.close();
  }
  return rec;
}
