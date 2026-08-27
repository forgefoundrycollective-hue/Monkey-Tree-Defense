// Shared plumbing for the headless game suites.
//
// The game is a single self-contained index.html, so every test drives the
// real thing in a real browser via the window.__mtd seam it exposes. There
// is no build step and no test framework — just node tests/run-all.mjs.

import { pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const GAME_URL = pathToFileURL(resolve(HERE, "..", "index.html")).href;

// Playwright may be a local dependency, a global install, or (in the sandbox
// these were written in) an absolute path. Try each rather than pinning one.
export async function loadChromium() {
  const candidates = [
    process.env.PLAYWRIGHT_MODULE,
    "playwright",
    "@playwright/test",
    "/opt/node22/lib/node_modules/playwright/index.mjs",
  ].filter(Boolean);
  const failures = [];
  for (const spec of candidates) {
    try {
      const mod = await import(spec);
      if (mod.chromium) return mod.chromium;
    } catch (e) {
      failures.push(`${spec}: ${e.message.split("\n")[0]}`);
    }
  }
  throw new Error(
    "Could not load Playwright. Install it (npm i -D playwright) or set " +
    "PLAYWRIGHT_MODULE to its entry point.\nTried:\n  " + failures.join("\n  ")
  );
}

// Collects PASS/FAIL lines plus any console/page errors the game emitted.
export function createRecorder(suiteName) {
  const results = [], errors = [];
  return {
    suiteName,
    results,
    errors,
    check(name, ok, detail = "") {
      results.push({ name, ok: !!ok, detail: typeof detail === "string" ? detail : JSON.stringify(detail) });
    },
    watch(page) {
      page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
      page.on("pageerror", e => errors.push("pageerror: " + e.message));
    },
    get failed() { return this.results.some(r => !r.ok) || this.errors.length > 0; },
    print() {
      for (const r of results) {
        console.log(`${r.ok ? "  PASS" : "  FAIL"} ${r.name}${r.detail ? "  " + r.detail : ""}`);
      }
      if (errors.length) for (const e of errors) console.log("  ERROR " + e);
    },
  };
}

// Opens the game and clicks past the title screen into a live run.
export async function openGame(browser, { width = 960, height = 540 } = {}) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(GAME_URL);
  await page.waitForFunction(() => !!window.__mtd);
  await page.evaluate(() => window.__mtd.start());
  await page.waitForFunction(() => window.__mtd.G.state === "play");
  return page;
}

// Freezes the wave pump AND the animation loop, so a test can set up an
// exact board without the spawner injecting surprises and without real time
// passing between evaluate() round-trips. Time then only moves via step().
export async function quiesce(page) {
  await page.evaluate(() => {
    const G = window.__mtd.G;
    window.__mtd.freeze(true);
    G.toSpawn = 0;
    G.spawnT = 1e9;
    G.enemies.length = 0;
    G.shots.length = 0;
    G.squadQueue.length = 0;
    G.waveLull = 1e9;   // don't roll into the next wave mid-test
  });
}

// Advances the simulation by `seconds` in fixed steps, without depending on
// wall-clock timing (CDP round-trips make real waits unreliable for anything
// sub-second, and the rAF loop keeps running between evaluate() calls).
export async function step(page, seconds, dt = 1 / 60) {
  await page.evaluate(([secs, delta]) => {
    const n = Math.round(secs / delta);
    for (let i = 0; i < n; i++) window.__mtd.step(delta);
  }, [seconds, dt]);
}

// Hands the clock back to the browser's animation loop.
export async function thaw(page) {
  await page.evaluate(() => window.__mtd.freeze(false));
}

// Waits for a predicate evaluated in the page, letting the real loop run.
export async function until(page, fn, { timeout = 15000, interval = 100 } = {}) {
  const started = Date.now();
  for (;;) {
    const v = await page.evaluate(fn);
    if (v) return v;
    if (Date.now() - started > timeout) return null;
    await new Promise(r => setTimeout(r, interval));
  }
}

// Drops an enemy onto the board in a known state.
export async function placeEnemy(page, spec) {
  await page.evaluate(s => {
    const G = window.__mtd.G;
    const base = {
      side: 1, hp: 2, maxhp: 2, r: 18, vx: -60,
      state: "attack", t: 0, atk: 99, flash: 0, flee: false, bob: 0,
    };
    G.enemies.push(Object.assign(base, s));
  }, spec);
}
