# UI/UX Design Kit

**A workspace where designers create real, working prototypes that look and
behave like your organisation's actual product — and developers can pick
them up and ship them without starting over.**

No design tools to learn. No throwaway mockups. You describe what you want,
an AI assistant builds it using *your* design system's genuine building
blocks, and you refine it right in the browser.

---

## The problem this solves

Most prototypes are pictures. They look like the product, but they're built
in a design tool, disconnected from the real components engineers use. When
it's time to build, developers start from scratch — re-creating screens,
guessing at details, and losing things in translation.

This kit flips that. Prototypes here are made of the **same buttons, tables,
menus, and colours your real product uses**. When a prototype is approved,
a developer takes the actual files, plugs in real data, and ships. Nothing
gets redrawn, re-explained, or rebuilt.

## How it works, in plain terms

Think of the kit as four things working together:

### 1. A gallery of prototypes ("the Catalogue")
A simple web page listing every prototype your team has made. From here you
can open one, make a new one, or "remix" an existing one (copy it and take
it in a different direction — the original stays untouched). Green and grey
dots show which prototypes are currently running.

### 2. A cheat sheet of your design system ("the Manifest")
Before anything gets built, the kit scans your organisation's design system —
every component, every approved variant, every colour token and icon — and
writes it into a machine-readable cheat sheet. Your team then adds the things
a scan can't know: your layout patterns, your do's and don'ts, your tone of
voice.

This cheat sheet is what keeps the AI honest. It can only use components and
styles that **actually exist in your design system**. It cannot invent a
button style your product doesn't have.

### 3. An AI assistant that does the building
You work in plain English. Tell it *"I need a screen where a manager reviews
and approves timesheets"* and it will:

1. **Ask the right questions first** — who is this for, what problem does it
   solve, how polished should it be? It acts like a thoughtful product
   manager before writing anything.
2. **Build the screen** using only your design system's parts, with sensible
   sample data included so it feels alive.
3. **Check its own work** — that it runs, follows the rules, and handles the
   awkward states (empty lists, loading, errors).

### 4. Tools for refining it in the browser
Open a prototype in your web browser and two tools appear on the page:

- **Markup** — like sticky notes for a live prototype. Click anywhere, type
  what should change ("this heading is too small", "move this button left"),
  and press Send. The AI reads each note, makes the change, and marks the
  note green when it's done.
- **The Tweaker** — click any component on the page and change its options
  from a small panel: make a button prominent instead of subtle, change a
  badge's colour. It only offers choices your design system permits, and
  every change is saved into the prototype itself — not a temporary overlay.

## From prototype to shipped product

This is the part that makes the kit different. Every prototype keeps its
pretend data in one clearly-marked drawer (a "mock service layer") instead
of scattering it through the screens. When a prototype is approved, a single
handoff command copies it into the developers' codebase along with a
generated checklist: *here is exactly the list of data connections to wire
up, here is what each screen expects, here is what's unfinished.*

The developer connects real data behind that drawer, removes the pretend
data, and the screens — the ones everyone already reviewed and approved —
ship as-is.

## A typical week with the kit

1. **Monday** — You open the Catalogue, hit *New prototype*, and describe the
   idea to the AI. Twenty minutes later there's a working screen using your
   real design system.
2. **Tuesday** — You share it with the team. People click through it in the
   browser and leave Markup notes on anything that feels off.
3. **Wednesday** — The AI works through the notes one by one; each note turns
   green as its change lands. You use the Tweaker to try a few variant
   swaps yourself.
4. **Thursday** — Stakeholders approve. You run the handoff, and the
   prototype lands in the product codebase with its integration checklist.
5. **Friday** — A developer wires up the real data. What ships is what
   everyone saw.

## What's in the box

| Folder | What it is |
|--------|------------|
| `catalogue/` | The prototype gallery web page |
| `stack-templates/` | Starter shells for different technology stacks (the React + shadcn one is the fully-curated reference) |
| `stack-templates/*/manifest/` | The design-system cheat sheets |
| `prototypes/` | Your prototypes — one folder each, fully self-contained |
| `pdk-core/` | The kit's engine (scanners, browser tools, servers) |
| `.claude/skills/` | The AI assistant's instructions and workflows |
| `docs/` | Working rules and the decision log |

## Getting started (the one technical bit)

Someone comfortable with a terminal needs about five minutes:

```bash
git clone https://github.com/mwhjfung/UIUXDesignKit.git
cd UIUXDesignKit
npm install        # requires Node.js 20 or newer
npm run dev        # opens the Catalogue at http://localhost:5170
```

From the Catalogue, create a prototype, then in its folder run
`npm install && npm run dev` and open it in the browser — the Markup and
Tweaker tools appear automatically. Building with the AI assistant happens
through [Claude Code](https://claude.com/claude-code): open the repo there
and simply describe what you want.

To point the kit at **your** design system: copy the closest stack template,
swap in your design-system packages, then run `/scaffold-manifest` (the
automatic scan) and `/curate-manifest` (a ~30-minute guided interview that
captures your team's patterns and rules — this is where the quality comes
from). Full detail lives in `CLAUDE.md` and `docs/ai-working-rules.md`.

## Already have a product? Point the kit at it

If your company already has a codebase, you don't have to describe your
design system to the kit — link it:

- **Link your repos** — one command reads your product's code (and your
  design-system repo, if it lives separately), learns every component,
  colour, and icon you actually use, and studies your real screens to
  learn your team's habits.
- **Start from a real screen** — ask for "the timesheet approval page"
  and the kit copies that screen into a prototype you can safely change.
  The real data pipes are snipped and replaced with realistic pretend
  data, so nothing you do can touch production.
- **Hand it back** — when the redesign is approved, the handoff lands it
  right back in the repo it came from, with the connect-these-endpoints
  checklist for your developer.
- **Click, don't type** — the gallery has buttons for all of this: start
  from scratch or from a real screen, flip a prototype's status (draft →
  ready for dev → handed off), and hand it to developers. Buttons file
  "order tickets" that your AI assistant picks up — if it isn't already
  running, it announces waiting orders the next time you open it.

## Frequently asked questions

**Do I need to know how to code?**
No. You describe, review, annotate, and tweak. The one-time setup and the
final developer handoff are the only technical steps.

**Will the AI go off-brand?**
It can't use anything outside the manifest — the scanned-and-curated record
of your design system. If a component or variant isn't in there, it isn't
available.

**What happens to my feedback notes?**
Each Markup note becomes its own tracked change, applied one at a time, so
you can see exactly what changed in response to which note.

**Is a prototype the final product?**
It's the final *front-end*. It runs on sample data until a developer
connects the real thing — that's deliberate, and it's what makes the
handoff clean.
