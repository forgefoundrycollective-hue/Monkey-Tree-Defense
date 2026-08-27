// Touch aiming and the accessibility options.
import { loadChromium, createRecorder, openGame, quiesce, step, GAME_URL } from "./harness.mjs";

export default async function run() {
  const rec = createRecorder("controls");
  const chromium = await loadChromium();
  const browser = await chromium.launch();
  try {
    // ---------- Desktop: a click throws immediately ----------
    {
      const page = await openGame(browser);
      rec.watch(page);
      await quiesce(page);
      await page.mouse.click(700, 300);
      const shots = await page.evaluate(() => window.__mtd.G.shots.length);
      rec.check("a mouse click throws straight away", shots === 1, "shots=" + shots);
      await page.close();
    }

    // ---------- Touch: drag aims, release throws ----------
    {
      const ctx = await browser.newContext({
        viewport: { width: 420, height: 860 },
        hasTouch: true, isMobile: true,
      });
      const page = await ctx.newPage();
      rec.watch(page);
      await page.goto(GAME_URL);
      await page.waitForFunction(() => !!window.__mtd);
      // tap to start, the way a phone player would
      await page.touchscreen.tap(210, 430);
      await page.waitForFunction(() => window.__mtd.G.state === "play");
      await quiesce(page);

      const box = await page.evaluate(() => {
        const c = document.querySelector("canvas").getBoundingClientRect();
        return { x: c.x, y: c.y, w: c.width, h: c.height };
      });
      // press in open sky (away from the on-screen buttons), hold, then lift
      const px = box.x + box.w * 0.62, py = box.y + box.h * 0.42;
      await page.mouse.move(px, py);
      await page.mouse.down();
      const held = await page.evaluate(() => ({
        shots: window.__mtd.G.shots.length,
        touch: window.__mtd.touch(),
      }));
      rec.check("holding a finger down aims instead of throwing",
        held.shots === 0 && held.touch.mode && held.touch.aiming, JSON.stringify(held));

      await page.mouse.move(px - 40, py - 30);
      await page.mouse.up();
      const released = await page.evaluate(() => ({
        shots: window.__mtd.G.shots.length,
        aiming: window.__mtd.touch().aiming,
      }));
      rec.check("releasing the finger throws once",
        released.shots === 1 && !released.aiming, JSON.stringify(released));

      // dragging must not auto-repeat the way holding a mouse button does
      await page.evaluate(() => { window.__mtd.G.shots.length = 0; });
      await page.mouse.move(px, py);
      await page.mouse.down();
      await step(page, 1.5);
      const during = await page.evaluate(() => window.__mtd.G.shots.length);
      await page.mouse.up();
      rec.check("holding to aim never auto-fires", during === 0, "shots=" + during);

      // the phone player can reach the pause menu without a keyboard
      const paused = await page.evaluate(() => {
        const b = { x: 960 - 34, y: 108 };     // pause button, logical coords
        window.__mtd.G.paused = false;
        const hit = window.__mtd.touchButtonHit(b.x, b.y, true);
        return { hit, paused: window.__mtd.G.paused };
      });
      rec.check("a touch pause button exists and pauses",
        paused.hit && paused.paused, JSON.stringify(paused));

      await ctx.close();
    }

    // ---------- Options ----------
    {
      const page = await openGame(browser);
      rec.watch(page);
      await quiesce(page);

      // --- the title card's copy has to fit inside its panel ---
      const fit = await page.evaluate(() => window.__mtd.titleFit());
      rec.check("no title line overflows the panel",
        fit.overflow.length === 0, JSON.stringify(fit.overflow));
      rec.check("the title panel stays inside the canvas",
        fit.panelX >= 0 && fit.right <= 960 && fit.bottom <= 540, JSON.stringify(fit));

      const rows = await page.evaluate(() => window.__mtd.pauseRows().map(r => r.label));
      rec.check("the pause menu offers resume, controls, and the options",
        rows.join("|") === "Resume|Controls|Sound|Screen shake|Aim preview", JSON.stringify(rows));

      // --- the controls reference is reachable mid-run ---
      const ctrl = await page.evaluate(() => {
        const M = window.__mtd, G = M.G;
        G.paused = true;
        const rows = M.pauseRows().map(r => r.label);
        const i = rows.indexOf("Controls");
        M.pauseHit(480, 182 + i * (42 + 9) + 20);
        const page1 = M.pausePage();
        const listed = M.controlRows();
        // Back returns to the menu
        M.pauseHit(480, 540 - 72 + 20);
        const page2 = M.pausePage();
        G.paused = false;
        return { page1, page2, keys: listed.map(r => r[0]), blurb: listed.map(r => r[1]).join(" ") };
      });
      rec.check("the Controls row opens a controls page",
        ctrl.page1 === "controls" && ctrl.page2 === "menu", JSON.stringify({ p1: ctrl.page1, p2: ctrl.page2 }));
      rec.check("the controls page lists the stick key",
        ctrl.keys.includes("F") && /stick bonk/.test(ctrl.blurb), JSON.stringify(ctrl.keys));
      rec.check("the controls page explains the heavier arcs",
        /shorter arc/.test(ctrl.blurb) && /heavy arc/.test(ctrl.blurb), JSON.stringify(ctrl.blurb.slice(0, 80)));

      // pausing fresh always lands on the menu, and Esc backs out of controls
      const backOut = await page.evaluate(() => {
        const M = window.__mtd, G = M.G;
        G.paused = false;
        M.togglePause();                       // pause -> menu
        const a = M.pausePage();
        M.pauseHit(480, 182 + 1 * (42 + 9) + 20);   // open controls
        const b = M.pausePage();
        M.togglePause();                       // Esc/P backs out, stays paused
        const c = { page: M.pausePage(), paused: G.paused };
        M.togglePause();                       // now it resumes
        const d = { page: M.pausePage(), paused: G.paused };
        return { a, b, c, d };
      });
      rec.check("Esc backs out of the controls page before it unpauses",
        backOut.a === "menu" && backOut.b === "controls" &&
        backOut.c.page === "menu" && backOut.c.paused === true &&
        backOut.d.paused === false, JSON.stringify(backOut));

      // shake toggle actually suppresses camera shake
      const K = await page.evaluate(() => window.__mtd.consts());
      const shakeOff = await page.evaluate(k => {
        const G = window.__mtd.G;
        // ground kinds snap to their own y each tick, so fire along that line
        const gy = k.GROUND - 14;
        // A coconut detonating on an enemy normally kicks the camera hard.
        // Sample right after impact — shake decays fast by design.
        const blast = () => {
          G.shakeAmp = 0;
          G.enemies.length = 0; G.shots.length = 0;
          G.tree.hp = G.tree.max;
          G.enemies.push({ kind: "boar", side: 1, hp: 99, maxhp: 99, r: 26, x: 400, y: gy,
            vx: 0, state: "move", t: 0, atk: 99, flash: 0, flee: false, bob: 0 });
          G.shots.push({ kind: "coco", x: 380, y: gy, vx: 600, vy: 0, g: 0, r: 14, spin: 0, t: 0, bounced: false });
          for (let i = 0; i < 3; i++) window.__mtd.step(1 / 60);
          return G.shakeAmp;
        };
        window.__mtd.setOpt("shake", false);
        const off = blast();
        window.__mtd.setOpt("shake", true);
        const on = blast();
        G.enemies.length = 0; G.shots.length = 0;
        return { off, on };
      }, K);
      rec.check("turning screen shake off stops the camera shaking",
        shakeOff.off === 0 && shakeOff.on > 0, JSON.stringify(shakeOff));

      // clicking a row flips the option
      const toggled = await page.evaluate(() => {
        window.__mtd.setOpt("preview", true);
        window.__mtd.G.paused = true;
        const i = window.__mtd.pauseRows().findIndex(r => r.label === "Aim preview");
        window.__mtd.pauseHit(480, 182 + i * (42 + 9) + 20);
        const after = window.__mtd.opts.preview;
        window.__mtd.G.paused = false;
        return { after };
      });
      rec.check("clicking a menu row flips that option", toggled.after === false, JSON.stringify(toggled));

      // and the choice survives a reload
      await page.evaluate(() => window.__mtd.setOpt("shake", false));
      await page.reload();
      await page.waitForFunction(() => !!window.__mtd);
      const persisted = await page.evaluate(() => window.__mtd.opts.shake);
      rec.check("options persist across a reload", persisted === false, "shake=" + persisted);
      await page.evaluate(() => window.__mtd.setOpt("shake", true));
      await page.close();
    }

    // ---------- Reduced motion is respected on a first visit ----------
    {
      const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 960, height: 540 } });
      const page = await ctx.newPage();
      rec.watch(page);
      await page.goto(GAME_URL);
      await page.waitForFunction(() => !!window.__mtd);
      const dflt = await page.evaluate(() => window.__mtd.opts.shake);
      rec.check("prefers-reduced-motion defaults screen shake off", dflt === false, "shake=" + dflt);
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  return rec;
}
