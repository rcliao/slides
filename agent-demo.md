---
title: Slides — Built for Agents
theme: dark
---

# Slides

```
  ╔═══════════════════════════════════════╗
  ║  markdown in  →  presentation out     ║
  ║  agents lint  →  agents fix           ║
  ║  agents print →  humans present       ║
  ╚═══════════════════════════════════════╝
```

---
layout: center
---

## The Problem

```
  ┌─────────────────────────────────────────┐
  │  Agent: "Here's your presentation!"     │
  │                                         │
  │  Human: "Did you even look at it?"      │
  │                                         │
  │  Agent: "...I can't. I have no eyes."   │
  └─────────────────────────────────────────┘
```

<!-- pause -->

> Now agents can **lint**, **inspect**, and **preview** — no browser needed.

---

## The Agent Workflow

```
     ┌──────────┐
     │ Generate │
     └────┬─────┘
          │
          ▼
     ┌──────────┐     ┌──────────┐
     │   Lint   │────▶│   Fix    │
     └────┬─────┘     └────┬─────┘
          │                │
          │◄───────────────┘
          ▼
     ┌──────────┐
     │  Print   │  ← agent reads this
     └────┬─────┘
          │
          ▼
     ┌──────────┐
     │   TUI    │  ← human presents this
     └──────────┘
```

---
layout: terminal
---

## slides info

```
$ slides info deck.md

  Quarterly Review
  Theme: dark | Slides: 10

   1. Q1 Review     cover      12w 1s
   2. Revenue       default    85w 1s [code]
   3. Growth        default    62w 3s [mermaid]
   4. Roadmap       two-col    44w 1s
   5. Thanks!       cover       8w 1s
```

---
layout: terminal
---

## slides lint --json

```
$ slides lint deck.md --json
{
  "valid": false,
  "errors": [
    { "slide": 5, "rule": "exec-const",
      "message": "const breaks state sharing" }
  ],
  "warnings": [
    { "slide": 3, "rule": "density",
      "message": "180 words - consider splitting" }
  ],
  "stats": {
    "avgWordsPerSlide": 65,
    "estimatedMinutes": 15
  }
}
```

---
layout: two-column
---

## Slide Surgery

<!-- column -->

### Extract

```
$ slides get deck.md 5
## Thanks!
Questions?
```

### Replace

```
$ echo "..." | slides set deck.md 5
Updated slide 5
```

<!-- column -->

### Insert

```
$ echo "..." | slides insert deck.md 3
Inserted at position 4
```

### Remove

```
$ slides remove deck.md 7
Removed slide 7
```

---

## slides print — The Agent's Eyes

```
  ┌────────────────────────────────────────────┐
  │  $ slides print deck.md --slide=3          │
  │                                            │
  │   Slide 3/10 ────────────── default        │
  │                                            │
  │     Growth Metrics                         │
  │     ──────────────                         │
  │                                            │
  │     • Revenue up 23% QoQ                   │
  │     • User base crossed 1M                 │
  │     • Churn down to 2.1%                   │
  │                                            │
  │  ──────────────────────────────────────     │
  └────────────────────────────────────────────┘
```

<!-- pause -->

The agent **reads** this and reasons about layout, density, and pacing.

---

## slides tui — Human Takes Over

```
  ┌──────────────────────────────────────────────────┐
  │ Quarterly Review            default  3/10        │
  │ ─────────────────────────────────────────────     │
  │                                                  │
  │                                                  │
  │     Growth Metrics                               │
  │     ──────────────                               │
  │                                                  │
  │     • Revenue up 23% QoQ                         │
  │     • User base crossed 1M                       │
  │     • Churn down to 2.1%                         │
  │                                                  │
  │                                                  │
  │ ─────────────────────────────────────────────     │
  │ ←/→ navigate  q quit  g first  G last  ? help   │
  └──────────────────────────────────────────────────┘
```

Full-screen terminal presentation. No browser. SSH-friendly.

---
layout: terminal
---

## Typewriter Animation

```typewriter
$ slides generate "Intro to WebAssembly"
Generating presentation...
✓ Generated: intro-wasm.md (10 slides)

$ slides lint intro-wasm.md --json
✓ Valid: 0 errors, 1 warning

$ slides tui intro-wasm.md
Presenting...
```

Types out character-by-character in TUI mode!

---
layout: center
---

## Three Layers, One Parser

```
            ┌─────────────────────────┐
            │      MCP Server         │  agents call directly
            │  lint_deck  render_slide│
            └───────────┬─────────────┘
                        │
            ┌───────────┴─────────────┐
            │      CLI Commands       │  agents shell out
            │  lint  info  print  tui │
            └───────────┬─────────────┘
                        │
            ┌───────────┴─────────────┐
            │      JS/TS API          │  library users
            │  parseSlides()          │
            │  lintSlides()           │
            │  renderSlideToText()    │
            └─────────────────────────┘
```

---
layout: center
---

## Pixel Art — Built In

Use `pixels` code blocks for sprite art:

```pixels
......RRRR......
....RRRRRRRR....
...RRRRRRRRRR...
..RRRR.RR.RRRR..
..RRRRRRRRRRRR..
..RRR..RR..RRR..
...RR.RRRR.RR...
....RRRRRRRR....
......RRRR......
```

Agents can auto-convert sprites: `node scripts/sprite-to-pixels.mjs sprite.png`

---
confetti: true
---

# Built for Agents

```pixels
..............OKK.....................
............OK...O....................
..........OK....O.................KKK.
.........K.....O................KKOOOK
........K......K...............KOOOKOK
.......K........O.............KOOOKKOK
......OO.......OK............KOOOKKKOK
......K.O.....O.OKO.........KOOOKKKKOK
.....O.O.O.O.O.OOOOK........KOOKKKKKOK
.....KO.O.O.O.O.OOOOK......KOOOKKKKOK.
....OOOO.O.O.O.OOOOOOK.....KOOKKKKKOK.
....KOOOOOOOOOOOOOOOOK....KOOOKKKKOK..
..OKKKKKOOOOOOOOOKOKOOK...KOOKKKKKOK..
OKOOOOOOKKKOOOOOK.K.KOOKKKOOOKKKKOK...
KOOOKKOOOOOKKOOOKOOOOKOOOOOOOKKOOK....
.KOKKKKKKOOOOKKOOOOOOOOOOOOOKOOKK.....
.OOOKKKKKKKOOOOKKOOOOOOOOOOOOKK.......
..OKOOKKKKKKOOOKOOOOOOOOOKOOOK........
...OKOOOKKKKKOOKOOOOOOOOK.KOOOO.......
.....OKKOOOOOOKOOKOOOOOOKKKOOOK.......
........KKKKKKKOK.KOOOOOOKKOOOK.......
.........KOOK.KOKKKOOOOOOKKKOOOK......
........OOOO..KOOKKOOOOOOOKOOOOKKK....
........KOOK...KOKKKOKOOOOOOOOOKOOK...
.......OOOO..OKKOOKOOOOOKOOOOOKOOOK...
.......KOOK.O..KOOOOOOKKOOOOOOKOO.OK..
.......KOOK....OOOOOOOOOOOOOOKOO.O.K..
.......KOOK...O.KOOOOOOOOOOKKOOOO.OK..
```

Generate. Lint. Fix. Present.

`slides tui deck.md`
