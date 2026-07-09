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
| Mute / Pause | `M` / `P` |

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
- Chain kills within 2 seconds for a **combo multiplier**.
- Clearing a wave heals the tree a little — and sometimes the tide leaves a
  **clam** at the trunk base. Climb down, grab it before the next wave arrives,
  and throw it (`Q`): whatever species it hits is banished for the wave.
- When the tree is nearly gone, listen for the heartbeat…
- If the tree's HP hits zero — **TIMBERRR!** — it crashes down (squashing
  anyone underneath), and your monkey runs down the beach to claim a fresh
  tree. There is no game over: the new tree **restarts at a checkpoint — half
  the wave you reached** (fall on wave 7, restart at 3; wave 10, restart
  at 5) — while your score keeps climbing. Beat your best.

## Tech notes

- Vanilla JavaScript + Canvas 2D, one file, no assets, no build step.
- All art is drawn procedurally each frame (960×540 logical resolution,
  letterboxed to any window size).
- All audio is synthesized with the Web Audio API — SFX are little
  oscillator/noise recipes, and the background tune is a 4-bar loop rendered
  into a buffer at load time.
