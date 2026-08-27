#!/usr/bin/env node
// Plays the game headlessly, many times, and reports how far it actually gets.
//
//   node tools/balance.mjs                  # 30 runs, default policy
//   node tools/balance.mjs --runs 60
//   node tools/balance.mjs --no-upgrades    # skip every upgrade offered
//   node tools/balance.mjs --skill 0.75     # 0..1, how well the bot aims
//
// This exists because balance claims were guesses. The bot is deliberately
// mediocre — it plays the game the way a competent-but-not-expert player
// would — so the numbers describe the shape of the difficulty curve rather
// than what a perfect player could squeeze out of it.

import { loadChromium, GAME_URL } from "../tests/harness.mjs";

const arg = (name, dflt) => {
  const i = process.argv.indexOf("--" + name);
  return i === -1 ? dflt : process.argv[i + 1];
};
const RUNS = +arg("runs", 30);
const SKILL = +arg("skill", 0.8);
const TAKE_UPGRADES = !process.argv.includes("--no-upgrades");
const SIM_SECONDS = +arg("seconds", 600);   // simulated in-game seconds per run

// The whole policy runs inside the page so a run costs one round-trip.
// It drives the real game through window.__mtd at a fixed timestep.
const PLAY = ({ simSeconds, skill, takeUpgrades, seed }) => {
  const M = window.__mtd, G = M.G;
  const K = M.consts();

  // deterministic RNG so a reported run can be reproduced
  let s = seed >>> 0;
  const rand = () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Math.random = rand;

  // Medals persist in localStorage and grant small head starts, so without
  // this each successive run in the same page would open stronger than the
  // last and the measurement would drift upward.
  M.resetProfile();

  G.state = "title";
  M.start();
  M.freeze(true);

  const dt = 1 / 60;
  const steps = Math.round(simSeconds / dt);
  const stats = {
    maxWave: 1, treesLost: 0, score: 0, kills: 0,
    upgrades: {}, waveHist: {}, endedAt: null,
    bananasThrown: 0, cocosThrown: 0, bonks: 0, clams: 0,
  };
  let lastTree = 0;

  const threat = () => {
    // nearest live attacker, preferring whatever is closest to the trunk
    let best = null, bestD = 1e9;
    for (const e of G.enemies) {
      if (e.dead) continue;
      if (e.flee && !e.thief) continue;
      const d = Math.abs(e.x - K.TREE_X) + Math.abs(e.y - G.monkey.y) * 0.5;
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  };

  for (let i = 0; i < steps; i++) {
    // --- pick upgrades when offered ---
    if (G.state === "draft") {
      if (takeUpgrades) M.takeUpgrade(Math.floor(rand() * G.draft.picks.length));
      else {
        // still have to leave the screen; take one then strip it back off
        const before = JSON.parse(JSON.stringify(G.upgrades));
        M.takeUpgrade(0);
        G.upgrades = before;
      }
      continue;
    }

    if (G.state === "play") {
      const m = G.monkey, t = threat();
      if (t && m.stunT <= 0) {
        // climb toward the threat's height, staying inside the trunk
        const wantY = Math.max(K.CLIMB_MIN, Math.min(K.CLIMB_MAX, t.y - 10));
        m.y += Math.sign(wantY - m.y) * Math.min(Math.abs(wantY - m.y), 240 * dt);

        // aim at it, with a skill-scaled error, and lead the target a little
        const lead = 0.12;
        const tx = t.x + (t.vx || 0) * lead;
        const ty = t.y + (t.kind === "bird" || t.kind === "gull" ? -8 : -14);
        const err = (1 - skill) * 90;
        M.aim(tx + (rand() - 0.5) * err, ty + (rand() - 0.5) * err);

        const near = Math.hypot(t.x - m.x, t.y - m.y);
        // a shelled hermit needs a coconut or the stick, never bananas
        const shelled = !!t.armored;
        if (near < 70 && m.swingCd <= 0) { M.swing(); stats.bonks++; }
        else if (G.heldClam && G.wave >= 8 && rand() < 0.02) { M.throwClam(); stats.clams++; }
        else if ((shelled || rand() < 0.25) && G.cocoCd <= 0) { M.throwCoconut(); stats.cocosThrown++; }
        else if (!shelled && G.bananas > 0) { M.throwBanana(); stats.bananasThrown++; }
      } else if (!t && G.clam && m.stunT <= 0) {
        // quiet moment: go collect the clam
        m.y = Math.min(K.CLIMB_MAX, m.y + 240 * dt);
      }
      stats.maxWave = Math.max(stats.maxWave, G.wave);
      stats.waveHist[G.wave] = (stats.waveHist[G.wave] || 0) + 1;
    }

    if (G.treesLost !== lastTree) { lastTree = G.treesLost; stats.treesLost = G.treesLost; }
    M.step(dt);
  }

  stats.score = G.score;
  stats.upgrades = JSON.parse(JSON.stringify(G.upgrades));
  stats.treesLost = G.treesLost;
  stats.endedAt = G.wave;
  return stats;
};

// ------------------------------ report ------------------------------
const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
const quantile = (xs, q) => {
  const v = [...xs].sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.floor(q * v.length))];
};
const mean = xs => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);

function histogram(values, width = 34) {
  const buckets = new Map();
  for (const v of values) buckets.set(v, (buckets.get(v) || 0) + 1);
  const keys = [...buckets.keys()].sort((a, b) => a - b);
  const peak = Math.max(...buckets.values());
  return keys.map(k => {
    const n = buckets.get(k);
    return `  wave ${String(k).padStart(3)}  ${"█".repeat(Math.max(1, Math.round(n / peak * width)))} ${n}`;
  }).join("\n");
}

const chromium = await loadChromium();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
await page.goto(GAME_URL);
await page.waitForFunction(() => !!window.__mtd);

console.log(`Playing ${RUNS} runs · skill ${SKILL} · upgrades ${TAKE_UPGRADES ? "on" : "off"} · ${SIM_SECONDS}s each\n`);

const results = [];
for (let i = 0; i < RUNS; i++) {
  const r = await page.evaluate(PLAY, {
    simSeconds: SIM_SECONDS, skill: SKILL, takeUpgrades: TAKE_UPGRADES, seed: 1234 + i * 7919,
  });
  results.push(r);
  process.stdout.write(`\r  run ${i + 1}/${RUNS}  → wave ${r.maxWave}, ${r.treesLost} trees lost   `);
  await page.reload();                      // fresh state, fresh localStorage-backed run
  await page.waitForFunction(() => !!window.__mtd);
}
console.log("\n");

const waves = results.map(r => r.maxWave);
const losses = results.map(r => r.treesLost);
console.log("Furthest wave reached");
console.log(histogram(waves));
console.log(`\n  median ${quantile(waves, 0.5)}   mean ${mean(waves).toFixed(1)}   ` +
            `p10 ${quantile(waves, 0.1)}   p90 ${quantile(waves, 0.9)}   max ${Math.max(...waves)}`);
console.log(`  trees lost: mean ${mean(losses).toFixed(1)}, ` +
            `runs that never lost a tree: ${pct(losses.filter(l => l === 0).length, losses.length)}%`);
console.log(`  reached the first King (wave 5): ${pct(waves.filter(w => w >= 5).length, waves.length)}%` +
            `   wave 10: ${pct(waves.filter(w => w >= 10).length, waves.length)}%` +
            `   wave 15: ${pct(waves.filter(w => w >= 15).length, waves.length)}%`);

if (TAKE_UPGRADES) {
  const totals = {};
  for (const r of results) for (const [k, v] of Object.entries(r.upgrades)) totals[k] = (totals[k] || 0) + v;
  const rank = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  console.log("\nUpgrade stacks taken (all runs)");
  for (const [k, v] of rank) console.log(`  ${k.padEnd(8)} ${"▪".repeat(Math.round(v / (rank[0][1] || 1) * 24))} ${v}`);
}

const shots = results.map(r => r.bananasThrown + r.cocosThrown);
console.log(`\n  avg throws/run ${Math.round(mean(shots))}   ` +
            `bonks ${Math.round(mean(results.map(r => r.bonks)))}   ` +
            `clams used ${mean(results.map(r => r.clams)).toFixed(1)}`);

await browser.close();
