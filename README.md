# 🐵🌴 Monkey Tree Defense

A bright, playful browser game: you're a monkey defending your beloved palm
tree from waves of beach bullies — dive-bombing toucans, scuttling crabs,
speedy snakes, and charging boars.

**▶ Play it now:** https://forgefoundrycollective-hue.github.io/monkey-tree-defense/

The entire game — art, sound effects, and music, all generated in code — lives
in a single `index.html` with zero dependencies and no build step.

## How to play

| Action | Control |
| --- | --- |
| Climb up / down the trunk | `W` / `S` or `↑` / `↓` |
| Aim | Mouse (dotted arc previews your throw) |
| Throw banana — fast & zippy | Click (hold to keep throwing) or `Space` |
| Throw coconut — heavy, **splash damage** | Right-click or `E` / `Shift` |
| Mute / Pause | `M` / `P` |

Touch controls (climb buttons + coconut button, tap to throw) appear
automatically on phones and tablets.

## The loop

- Enemies arrive in escalating waves and chew on your tree. Keep them off it!
- Every wave the creatures get **faster**, and the music speeds up with them.
- Chain kills within 2 seconds for a **combo multiplier**; clearing a wave
  heals the tree a little.
- If the tree's HP hits zero — **TIMBERRR!** — it crashes down (squashing
  anyone underneath), and your monkey runs down the beach to claim a fresh
  tree. There is no game over: a new tree simply **restarts the stage at
  wave 1**, while your score keeps climbing. Beat your best.

## Tech notes

- Vanilla JavaScript + Canvas 2D, one file, no assets.
- Procedural art at 960×540 logical resolution, letterboxed to any screen.
- All audio synthesized with the Web Audio API; the background tune is a
  4-bar loop rendered into a buffer at load time, and its tempo rises with
  the wave number.
- Deployed to GitHub Pages automatically on every push to `main`.
