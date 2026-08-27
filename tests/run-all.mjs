#!/usr/bin/env node
// Runs every suite and exits non-zero if anything failed.
//
//   node tests/run-all.mjs            # all suites
//   node tests/run-all.mjs ammo       # only suites whose name matches

import mechanics from "./mechanics.test.mjs";
import progression from "./progression.test.mjs";
import ammo from "./ammo.test.mjs";
import upgrades from "./upgrades.test.mjs";
import lategame from "./lategame.test.mjs";
import controls from "./controls.test.mjs";
import tips from "./tips.test.mjs";
import audio from "./audio.test.mjs";

const SUITES = { mechanics, progression, ammo, upgrades, lategame, controls, tips, audio };

const filter = process.argv[2];
const chosen = Object.entries(SUITES).filter(([name]) => !filter || name.includes(filter));

if (!chosen.length) {
  console.error(`No suite matches "${filter}". Available: ${Object.keys(SUITES).join(", ")}`);
  process.exit(2);
}

let passed = 0, failed = 0, errored = 0;
for (const [name, run] of chosen) {
  console.log(`\n${name}`);
  try {
    const rec = await run();
    rec.print();
    passed += rec.results.filter(r => r.ok).length;
    failed += rec.results.filter(r => !r.ok).length;
    errored += rec.errors.length;
  } catch (e) {
    console.log(`  FAIL suite crashed: ${e.message}`);
    failed++;
  }
}

const line = `\n${passed} passed, ${failed} failed` + (errored ? `, ${errored} page errors` : "");
console.log(line);
process.exit(failed || errored ? 1 : 0);
