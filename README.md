# 🐵🌴 Monkey Tree Defense

A bright, playful browser game: you're a monkey defending your beloved palm tree
from waves of beach bullies — dive-bombing toucans, scuttling crabs, speedy
snakes, and charging boars.

**▶ Play it now:** https://forgefoundrycollective-hue.github.io/Monkey-Tree-Defense/

The entire game — art, sound effects, and music, all generated in code — lives
in a single `index.html` with zero dependencies and no build step. Every push
to `main` auto-deploys to that link via GitHub Pages.

## How to play

| Action | Control |
| --- | --- |
| Climb up / down the trunk | `W` / `S` or `↑` / `↓` |
| Aim | Mouse (dotted arc previews your throw) |
| Throw banana — fast & zippy, limited stash | Click (hold to keep throwing) or `Space` |
| Throw coconut — heavy, **splash damage** | Right-click or `E` / `Shift` |
| Stick bonk — melee, reaches the ground only when you're low | `F` |
| Throw a found clam — **banishes** that species for the wave | `Q` |
| Mute / Pause | `M` / `P` (or the ⏸ button on touch) |

On a phone, **drag to aim and release to throw** — the arc preview follows your
finger, so you can line a shot up before committing. The pause menu carries
options for sound, screen shake, and the aim preview; screen shake starts off
if your device asks for reduced motion, and every choice is remembered.

You can't throw steeply downward — the higher you climb, the bigger the
blind spot at the trunk base. Climb down to defend low (and mind the
pinches: ground creatures can briefly stun a monkey within reach, though a
pinch always shoves attackers back and buys you a moment to climb clear).

Bananas aren't infinite: you carry a bunch of 6, and it regrows one at a
time rather than instantly, so mashing the throw button just empties the
bunch faster — pace your throws instead of spamming. The stash tops back
up whenever you clear a wave or claim a new tree.

Touch controls (climb buttons + coconut button, tap to throw) appear
automatically on touch devices.

## The loop

- Enemies arrive in escalating waves and chew on your tree. Keep them off it!
- Every wave the creatures get **faster**, and the music speeds up with them —
  feel the tension climb. From wave 4 they arrive in squads; from wave 6 birds
  **dive-bomb**; every 5th wave **King Pincher** (a crab of unreasonable size)
  comes for your trunk — fell him for a big tree heal.
- Wave 8 brings **hermit crabs**, whose shells make bananas clank off — bring a
  coconut or the stick. Wave 9 brings **gulls**, which ignore the tree entirely
  and rob your banana stash; shoot one down before it escapes and you get your
  bananas back.
- From wave 8 a wave can also carry a **modifier**: `WINDY` bends every throw
  (the aim preview bends with it), `NIGHTFALL` drops the sun for a moonlit
  fight, and `SWARM` sends far more of them, far faster.
- Chain kills within 2 seconds for a **combo multiplier**.
- Every third wave (and after each King) you **pick an upgrade** — one of three
  cards, each bending a rule you already know: a bigger banana bunch, faster
  regrowth, heavier bananas, a longer stick, wider coconut blasts, a limber
  shoulder that lets you throw steeply downward, tougher bark, or luckier
  clams. They stack, and they last for the run.
- Clearing a wave heals the tree a little — and sometimes the tide leaves a
  **clam** at the trunk base. Climb down, grab it before the next wave arrives,
  and throw it (`Q`): whatever species it hits is banished for the wave.
- The first time each new threat turns up — a shelled hermit, a thieving gull,
  a dive-bomb, a washed-up clam — the game explains it once, so you learn the
  rule instead of guessing at it.
- When the tree is nearly gone, listen for the heartbeat…
- If the tree's HP hits zero — **TIMBERRR!** — it crashes down (squashing
  anyone underneath), and your monkey runs down the beach to claim a fresh
  tree. There is no game over: the new tree **restarts at a checkpoint — half
  the wave you reached** (fall on wave 7, restart at 3; wave 10, restart
  at 5) — while your score keeps climbing. Beat your best. As the monkey
  sprints off, a card shows how that tree went: waves survived, kills, best
  combo, points, and the upgrades it earned.

## Tech notes

- Vanilla JavaScript + Canvas 2D, one file, no assets, no build step.
- All art is drawn procedurally each frame (960×540 logical resolution,
  letterboxed to any window size).
- All audio is synthesized with the Web Audio API — SFX are little
  oscillator/noise recipes, and the background tune is a 4-bar loop rendered
  into a buffer at load time. A second, phase-locked loop carries a low
  ostinato that fades in only while King Pincher is on the beach, and night
  waves close a lowpass over the music and bring out crickets.

## Tests

The game is driven headlessly in a real browser through the `window.__mtd`
seam it exposes, so the suites exercise the shipping `index.html` directly —
no build step, no test framework.

```sh
node tests/run-all.mjs              # every suite
node tests/run-all.mjs ammo         # just the matching suite
```

Playwright is resolved from a local install, a global one, or
`PLAYWRIGHT_MODULE` if you need to point at a specific copy.

| Suite | Covers |
| --- | --- |
| `mechanics` | Aim cone clamping, stick reach, the pinch/stun/shove exchange, clam banishing, King Pincher |
| `progression` | Checkpoint restarts, per-wave state resets, squads and dive-bombs |
| `ammo` | Banana stash caps, dry-throw handling, regrow pacing, refills |
| `upgrades` | Draft cadence, each upgrade's effect, stack caps, run resets |
| `lategame` | Wave-8+ unlocks, hermit armor, gull theft and recovery, wave modifiers |
| `controls` | Mouse vs touch throwing, drag-to-aim, pause menu, options and their persistence |
| `tips` | First-encounter coaching fires once, expires, and resets per run |
| `audio` | Music layering: the King's ostinato, the night filter, and tempo staying locked across layers |
