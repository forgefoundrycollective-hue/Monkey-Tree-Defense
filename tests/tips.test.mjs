// First-encounter coaching: each rule explains itself once, then stays quiet.
import { loadChromium, createRecorder, openGame, quiesce, step } from "./harness.mjs";

const tipText = page => page.evaluate(() => window.__mtd.G.tip && window.__mtd.G.tip.text);
const clearTip = page => page.evaluate(() => { window.__mtd.G.tip = null; });

export default async function run() {
  const rec = createRecorder("tips");
  const chromium = await loadChromium();
  const browser = await chromium.launch();
  try {
    const page = await openGame(browser);
    rec.watch(page);
    const K = await page.evaluate(() => window.__mtd.consts());
    await quiesce(page);

    // --- A hermit explains its own shell the first time it shows up ---
    await page.evaluate(() => { window.__mtd.G.wave = 8; window.__mtd.spawnEnemy("hermit"); });
    const hermitTip = await tipText(page);
    rec.check("meeting a hermit explains the shell",
      !!hermitTip && /shell/i.test(hermitTip), JSON.stringify(hermitTip));

    // ...and never again in the same run
    await clearTip(page);
    await page.evaluate(() => window.__mtd.spawnEnemy("hermit"));
    const second = await tipText(page);
    rec.check("the same tip never fires twice in a run", second === null, JSON.stringify(second));

    // --- A gull explains what it's after ---
    await clearTip(page);
    await page.evaluate(() => { window.__mtd.G.wave = 9; window.__mtd.spawnEnemy("gull"); });
    const gullTip = await tipText(page);
    rec.check("meeting a gull explains the theft",
      !!gullTip && /banana/i.test(gullTip), JSON.stringify(gullTip));

    // --- Running the stash dry explains that it regrows ---
    await clearTip(page);
    await page.evaluate(() => {
      const G = window.__mtd.G;
      G.bananas = 0; G.bananaFlash = 0; G.monkey.stunT = 0; G.bananaCd = 0;
      window.__mtd.throwBanana();
    });
    const emptyTip = await tipText(page);
    rec.check("running dry explains that the bunch regrows",
      !!emptyTip && /regrow/i.test(emptyTip), JSON.stringify(emptyTip));

    // --- Getting pinched explains the pinch ---
    await clearTip(page);
    await page.evaluate(k => {
      const G = window.__mtd.G;
      G.enemies.length = 0;
      G.monkey.y = k.CLIMB_MAX; G.monkey.stunT = 0; G.monkey.safeT = 0;
      G.enemies.push({ kind: "crab", side: 1, hp: 2, maxhp: 2, r: 18, x: k.TREE_X + 2,
        y: k.GROUND - 10, vx: -60, state: "attack", t: 0, atk: 0.01, flash: 0, flee: false, bob: 0 });
    }, K);
    await step(page, 0.1);
    const pinchTip = await tipText(page);
    rec.check("the first pinch explains itself",
      !!pinchTip && /pinch/i.test(pinchTip), JSON.stringify(pinchTip));

    // --- Tips expire on their own ---
    await step(page, 5.2);
    const expired = await tipText(page);
    rec.check("a tip clears itself after a few seconds", expired === null, JSON.stringify(expired));

    // --- A fresh run coaches a new player again ---
    const reset = await page.evaluate(() => {
      const G = window.__mtd.G;
      G.state = "title";
      window.__mtd.start();
      return { seen: Object.keys(G.tipsSeen).length, tip: G.tip };
    });
    rec.check("a new run starts coaching from scratch",
      reset.seen === 0 && reset.tip === null, JSON.stringify(reset));

    // --- Tips never queue up on top of each other ---
    await quiesce(page);
    const single = await page.evaluate(() => {
      const G = window.__mtd.G;
      G.wave = 9; G.tipsSeen = {}; G.tip = null;
      window.__mtd.spawnEnemy("hermit");
      window.__mtd.spawnEnemy("gull");
      return { text: G.tip && G.tip.text, isObject: !Array.isArray(G.tip) };
    });
    rec.check("only one tip is ever on screen", single.isObject && !!single.text, JSON.stringify(single));
  } finally {
    await browser.close();
  }
  return rec;
}
