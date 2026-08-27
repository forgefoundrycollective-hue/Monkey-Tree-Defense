// Boon drafting: when it triggers, and that each boon actually bends its rule.
import { loadChromium, createRecorder, openGame, quiesce, step, until, placeEnemy } from "./harness.mjs";

// Clears the board so the wave-clear path fires, and runs until the draft opens.
async function clearWaveAt(page, wave) {
  await page.evaluate(w => {
    const G = window.__mtd.G;
    window.__mtd.setWave(w);
    G.enemies.length = 0; G.squadQueue.length = 0; G.shots.length = 0;
    G.toSpawn = 0; G.spawnT = 1e9; G.waveLull = 0;
  }, wave);
  await step(page, 4.2);   // wave-clear banner lull is 3s
  return page.evaluate(() => ({
    state: window.__mtd.G.state,
    picks: window.__mtd.G.draft ? window.__mtd.G.draft.picks.map(p => p.id) : null,
    wave: window.__mtd.G.wave,
  }));
}

export default async function run() {
  const rec = createRecorder("boons");
  const chromium = await loadChromium();
  const browser = await chromium.launch();
  try {
    const page = await openGame(browser);
    rec.watch(page);
    const K = await page.evaluate(() => window.__mtd.consts());
    await quiesce(page);

    // --- Trigger cadence ---
    const w2 = await clearWaveAt(page, 2);
    rec.check("wave 2 rolls straight into wave 3 with no draft",
      w2.state === "play" && !w2.picks && w2.wave === 3, JSON.stringify(w2));

    const w3 = await clearWaveAt(page, 3);
    rec.check("clearing wave 3 opens a draft of three distinct boons",
      w3.state === "draft" && w3.picks && w3.picks.length === 3 &&
      new Set(w3.picks).size === 3, JSON.stringify(w3));

    // --- Picking resumes the run on the next wave ---
    const picked = await page.evaluate(() => {
      const G = window.__mtd.G;
      const id = G.draft.picks[0].id;
      window.__mtd.takeBoon(0);
      return { id, state: G.state, wave: G.wave, level: G.boons[id], draft: G.draft };
    });
    rec.check("taking a boon banks it and starts the next wave",
      picked.state === "play" && picked.wave === 4 &&
      picked.level === 1 && picked.draft === null, JSON.stringify(picked));

    // --- Boss waves also draft (wave 5 is both %5 and a King wave) ---
    await quiesce(page);
    const w5 = await clearWaveAt(page, 5);
    rec.check("clearing a King wave also opens a draft",
      w5.state === "draft", JSON.stringify(w5));
    await page.evaluate(() => window.__mtd.takeBoon(0));

    // --- Each boon bends its rule. Grant directly and measure the effect. ---
    const effects = await page.evaluate(k => {
      const G = window.__mtd.G, M = window.__mtd;
      const out = {};
      const reset = () => { G.boons = {}; G.tree.max = 100; G.tree.hp = 100; };

      // Bigger Bunch: stash cap grows
      reset();
      const baseCap = (() => { G.bananas = 999; M.step(0); return G.bananas; })();
      reset(); G.boons.bunch = 2; G.bananas = 0;
      for (let i = 0; i < 60 * 60; i++) M.step(1 / 60);   // plenty of regrow time
      out.bunch = { base: k.BANANA_MAX, boosted: G.bananas };

      // Fast Ripening: refills sooner
      reset(); G.bananas = 0; G.bananaRegrow = k.BANANA_REGROW;
      for (let i = 0; i < Math.round(k.BANANA_REGROW * 60); i++) M.step(1 / 60);
      const plain = G.bananas;
      reset(); G.boons.ripen = 3; G.bananas = 0; G.bananaRegrow = 0.0001;
      for (let i = 0; i < Math.round(k.BANANA_REGROW * 60); i++) M.step(1 / 60);
      out.ripen = { plain, fast: G.bananas };

      // Heavy Bananas: +1 damage on hit
      const hitWithBanana = () => {
        G.enemies.length = 0; G.shots.length = 0;
        G.enemies.push({ kind: "boar", side: 1, hp: 6, maxhp: 6, r: 26, x: 600, y: k.GROUND - 14,
                         vx: 0, state: "move", t: 0, atk: 99, flash: 0, flee: false, bob: 0 });
        G.shots.push({ kind: "banana", x: 590, y: k.GROUND - 14, vx: 400, vy: 0, g: 0, r: 12, spin: 0, t: 0 });
        for (let i = 0; i < 12; i++) M.step(1 / 60);
        return G.enemies[0] ? 6 - G.enemies[0].hp : 6;
      };
      reset(); const plainHit = hitWithBanana();
      reset(); G.boons.ripe = 2; const heavyHit = hitWithBanana();
      out.ripe = { plainHit, heavyHit };

      // Longer Stick: reaches further from the trunk
      const bonkAt = dist => {
        G.enemies.length = 0;
        G.monkey.y = k.CLIMB_MAX; G.monkey.swingCd = 0; G.monkey.stunT = 0;
        G.enemies.push({ kind: "crab", side: 1, hp: 99, maxhp: 99, r: 18,
                         x: G.monkey.x + dist, y: G.monkey.y, vx: 0, state: "move",
                         t: 0, atk: 99, flash: 0, flee: false, bob: 0 });
        M.swing();
        return G.enemies[0].hp < 99;
      };
      reset(); const shortReach = bonkAt(100);
      reset(); G.boons.stick = 3; const longReach = bonkAt(100);
      out.stick = { shortReach, longReach };

      // Limber Shoulder: the aim cone opens downward
      const launchAngle = () => {
        G.shots.length = 0; G.bananaCd = 0; G.bananas = 9; G.monkey.stunT = 0;
        G.monkey.y = k.CLIMB_MIN;
        M.aim(G.monkey.x + 2, 530);                  // aim near-straight down
        M.throwBanana();
        const s = G.shots[0];
        return s ? Math.atan2(s.vy - s.g * s.t, s.vx) * 180 / Math.PI : null;
      };
      reset(); const tightAim = launchAngle();
      reset(); G.boons.limber = 2; const limberAim = launchAngle();
      out.limber = { tightAim, limberAim };

      // Iron Bark: raises and refills max tree HP
      reset(); G.tree.hp = 40;
      G.draft = { picks: [{ id: "bark", name: "Iron Bark", tint: "#6BBF59" }], t: 0, hover: -1 };
      G.state = "draft";
      M.takeBoon(0);
      out.bark = { max: G.tree.max, hp: G.tree.hp, state: G.state };

      reset();
      return out;
    }, K);

    rec.check("Bigger Bunch raises the stash cap",
      effects.bunch.boosted === effects.bunch.base + 6, JSON.stringify(effects.bunch));
    rec.check("Fast Ripening regrows sooner than the base rate",
      effects.ripen.fast > effects.ripen.plain, JSON.stringify(effects.ripen));
    rec.check("Heavy Bananas add damage per hit",
      effects.ripe.heavyHit === effects.ripe.plainHit + 2, JSON.stringify(effects.ripe));
    rec.check("Longer Stick reaches past the base swing",
      !effects.stick.shortReach && effects.stick.longReach, JSON.stringify(effects.stick));
    rec.check("Limber Shoulder opens the cone downward",
      effects.limber.limberAim > effects.limber.tightAim + 20, JSON.stringify(effects.limber));
    rec.check("Iron Bark raises max tree HP and heals to it",
      effects.bark.max === 125 && effects.bark.hp === 125, JSON.stringify(effects.bark));

    // --- A boon can't be stacked past its cap ---
    const capped = await page.evaluate(() => {
      const G = window.__mtd.G;
      G.boons = {};
      const b = window.__mtd.boonMax("ripe");
      G.boons.ripe = b;
      // a draft should never offer a maxed boon
      let offeredMaxed = false;
      for (let i = 0; i < 40; i++) {
        G.draft = null; G.state = "play";
        window.__mtd.openDraft();
        if (G.draft && G.draft.picks.some(p => p.id === "ripe")) offeredMaxed = true;
      }
      G.draft = null; G.state = "play"; G.boons = {};
      return { cap: b, offeredMaxed };
    });
    rec.check("a maxed boon stops being offered",
      !capped.offeredMaxed, JSON.stringify(capped));

    // --- A fresh run wipes boons ---
    const fresh = await page.evaluate(() => {
      const G = window.__mtd.G;
      G.boons = { bark: 2, bunch: 1 };
      G.tree.max = 150;
      G.state = "title";
      window.__mtd.start();
      return { boons: Object.keys(G.boons).length, treeMax: G.tree.max, bananas: G.bananas };
    });
    rec.check("starting a new run clears boons and tree upgrades",
      fresh.boons === 0 && fresh.treeMax === 100 && fresh.bananas === K.BANANA_MAX,
      JSON.stringify(fresh));
  } finally {
    await browser.close();
  }
  return rec;
}
