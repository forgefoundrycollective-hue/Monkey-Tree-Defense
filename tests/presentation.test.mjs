// Death effects, the King's entrance, and milestone fanfare.
import { loadChromium, createRecorder, openGame, quiesce, step } from "./harness.mjs";

export default async function run() {
  const rec = createRecorder("presentation");
  const chromium = await loadChromium();
  const browser = await chromium.launch();
  try {
    const page = await openGame(browser);
    rec.watch(page);
    const K = await page.evaluate(() => window.__mtd.consts());
    await page.evaluate(() => window.__mtd.resetProfile());
    await quiesce(page);

    // --- every species leaves its own debris behind ---
    const debris = await page.evaluate(k => {
      const M = window.__mtd, G = M.G;
      const kindsFor = who => {
        G.enemies.length = 0; G.shots.length = 0; G.parts.length = 0;
        G.enemies.push({ kind: who, side: 1, hp: 1, maxhp: 1, r: 20,
          x: 600, y: who === "bird" || who === "gull" ? 300 : k.GROUND - 12,
          vx: -60, state: "move", t: 0, atk: 99, flash: 0, flee: false, bob: 0,
          armored: who === "hermit", thief: who === "gull", loot: 0 });
        G.shots.push({ kind: "coco", x: 600, y: G.enemies[0].y, vx: 0, vy: 0,
                       g: 0, r: 14, spin: 0, t: 0, bounced: false });
        for (let i = 0; i < 4; i++) M.step(1 / 60);
        const seen = {};
        for (const p of G.parts) seen[p.kind] = (seen[p.kind] || 0) + 1;
        return { total: G.parts.length, seen };
      };
      return {
        bird: kindsFor("bird"), gull: kindsFor("gull"), crab: kindsFor("crab"),
        hermit: kindsFor("hermit"), snake: kindsFor("snake"), boar: kindsFor("boar"),
      };
    }, K);
    rec.check("birds and gulls burst into feathers",
      debris.bird.seen.feather >= 6 && debris.gull.seen.feather >= 8,
      JSON.stringify({ bird: debris.bird.seen.feather, gull: debris.gull.seen.feather }));
    rec.check("crabs and hermits throw shell chips",
      debris.crab.seen.chip >= 5 && debris.hermit.seen.chip >= 10,
      JSON.stringify({ crab: debris.crab.seen.chip, hermit: debris.hermit.seen.chip }));
    rec.check("snakes scatter scales, not chips",
      debris.snake.seen.leaf >= 6 && !debris.snake.seen.feather,
      JSON.stringify(debris.snake.seen));
    rec.check("boars kick up a dust cloud",
      debris.boar.seen.dust >= 1, JSON.stringify(debris.boar.seen));
    rec.check("each species leaves a distinguishable mix",
      new Set([
        Object.keys(debris.bird.seen).sort().join(),
        Object.keys(debris.crab.seen).sort().join(),
        Object.keys(debris.snake.seen).sort().join(),
        Object.keys(debris.boar.seen).sort().join(),
      ]).size >= 3,
      JSON.stringify(Object.fromEntries(Object.entries(debris).map(([k, v]) => [k, Object.keys(v.seen)]))));

    // --- the King gets an entrance ---
    const entrance = await page.evaluate(() => {
      const M = window.__mtd, G = M.G;
      G.enemies.length = 0; G.kingEntrance = 0; G.shakeAmp = 0;
      M.setWave(4);
      G.toSpawn = 0; G.squadQueue.length = 0; G.waveLull = 0;
      for (let i = 0; i < 240; i++) M.step(1 / 60);   // roll into wave 5
      return { wave: G.wave, entrance: G.kingEntrance, kings: G.enemies.filter(e => e.kind === "boss").length };
    });
    rec.check("rolling into a King wave triggers the entrance",
      entrance.wave === 5 && entrance.entrance > 0 && entrance.kings >= 1, JSON.stringify(entrance));

    const entranceEnds = await page.evaluate(() => {
      const M = window.__mtd, G = M.G;
      for (let i = 0; i < 60 * 4; i++) M.step(1 / 60);
      return { entrance: G.kingEntrance };
    });
    rec.check("the entrance clears itself and hands the screen back",
      entranceEnds.entrance === 0, JSON.stringify(entranceEnds));

    // --- milestone waves get a fanfare, ordinary ones don't ---
    const milestones = await page.evaluate(() => {
      const M = window.__mtd, G = M.G;
      // Clearing certain waves opens an upgrade draft, which parks the game
      // until a card is taken — so answer it and carry on to the next wave.
      const at = w => {
        G.state = "play"; G.draft = null;
        G.confetti = 0;
        G.enemies.length = 0; G.squadQueue.length = 0;
        G.wave = w - 1;
        G.toSpawn = 0; G.waveLull = 0;
        for (let i = 0; i < 600 && G.wave < w; i++) {
          if (G.state === "draft") M.takeUpgrade(0);
          else M.step(1 / 60);
        }
        return { wave: G.wave, confetti: G.confetti, banner: G.banner.text };
      };
      const ten = at(10), eleven = at(11), twenty = at(20);
      // no non-King multiple of 10 exists, but the banner branch still has to
      // work for a plain milestone if the boss cadence ever changes
      G.modifier = null;
      G.confetti = 0; G.waveLull = 1e9;
      return { ten, eleven, twenty };
    });
    // Every 10th wave is also a King wave, so the King's card still leads —
    // the milestone layers its confetti and fanfare on top rather than
    // replacing the announcement.
    rec.check("wave 10 fires the milestone flourish over the King's card",
      milestones.ten.wave === 10 && milestones.ten.confetti > 0 &&
      /KING/.test(milestones.ten.banner), JSON.stringify(milestones.ten));
    rec.check("wave 20 does too",
      milestones.twenty.wave === 20 && milestones.twenty.confetti > 0, JSON.stringify(milestones.twenty));
    rec.check("an ordinary wave gets no confetti",
      milestones.eleven.wave === 11 && milestones.eleven.confetti === 0, JSON.stringify(milestones.eleven));
  } finally {
    await browser.close();
  }
  return rec;
}
