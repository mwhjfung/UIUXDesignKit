---
name: design-advisory
description: >
  Use before any prototype is built — always the first step when a user asks
  to build, create, or mock up a screen or prototype. Acts as product manager:
  researches domain context from the sources in docs/knowledge-sources.md and
  the stack manifest's curated files, asks the user about audience and build
  mode, writes the prototype's context.md brief, then hands off to the
  prototyping skill.
metadata:
  version: "1.0"
  category: workflow
---

# Design Advisory

## Purpose

Act as the product manager for every prototype. Without this step prototypes
come out generic; with it they are grounded in real terminology, real user
roles, real workflows, and real constraints. The output is a **domain brief**
(`context.md`) that tells the prototyping skill *what* to build and *why* —
the prototyping skill decides *how*.

## When to use

**Always** — before any prototyping work begins. Exceptions:
- The user explicitly opts out ("skip domain context", "just explore freely").
- Modifying an existing prototype → read its `context.md`, go straight to
  the `prototyping` skill.

## Opt-out behaviour

1. Acknowledge: "Got it — I'll skip domain context and let you explore freely."
2. Write a minimal `context.md` (template below, opt-out variant).
3. Hand off to the prototyping skill immediately.

## Information sources

Read `docs/knowledge-sources.md`. It lists the organisation's knowledge
sources with trust levels:

| Trust | Role |
|-------|------|
| authoritative | Curated baseline — terminology, roles, workflows. Always the frame of reference. |
| additive | Live docs — fills gaps, currency checks. Never overrides authoritative. |
| signal | Activity data — what's being built now. Context, not definition. |

**Conflict rule:** authoritative sources win. If a live result contradicts a
curated definition, use the curated one and flag the discrepancy explicitly.
Never silently blend.

Two sources always exist regardless of that file:
- **The stack manifest's curated files** — `stack-templates/<stack>/manifest/`
  `patterns.md` (team layout preferences), `rules.md` (do/don't), `voice.md`
  (copy). These shape the brief's design-considerations section.
- **The conversation** — whatever the user tells you about their users and domain.

**If `docs/knowledge-sources.md` has no active sources:** warn once —
"No knowledge sources are configured (docs/knowledge-sources.md), so this
brief will lean on what you tell me. Output will be more generic." — then
proceed, interviewing the user briefly for the essentials (who is it for,
what job are they doing, key terms).

## Workflow

### Step 1 — Domain context?

Use `AskUserQuestion`:

> **Would you like this prototype informed by domain context?**
> 1. **Yes — use domain context** *(recommended)* — I'll research the
>    configured knowledge sources to ground it in real terminology, roles,
>    and workflows.
> 2. **No — free exploration** — no constraints, minimal brief.

If No → minimal context.md → hand off.

### Step 2 — Understand the prompt

Identify from the user's request: the product area, the likely user role(s),
the workflow being served, and the screen archetype (list, detail, form,
dashboard, flow).

### Step 3 — Research

Query the active sources in `docs/knowledge-sources.md` in trust order.
Extract: key terms + definitions, the step-by-step user workflow, field/data
names, constraints and pain points, and anything being actively built in this
area. Also read the stack's `manifest/patterns.md` for existing layout
patterns relevant to the archetype — note matches in the handoff message and
let the prototyping skill decide whether to use them.

### Step 4 — Write context.md

Create `prototypes/<slug>/context.md` (the prototyping skill creates the app
via the catalogue API if the folder doesn't exist yet — coordinate: write
context.md after scaffolding, or hold the content until then):

```markdown
# [Prototype name]

### Prompt
> [User's original request, verbatim]

### Intent
[1 sentence: what question does this prototype answer?]

### Domain context
**Area**: [product area, or "General exploration"]
**Sources**: [sources consulted, or "none configured — conversation only"]

### Audience
- **Role(s)**: [name] — [one line]
- **Device/environment**: [desktop/mobile/tablet, context of use]

### Key terminology
- **[Term]**: [definition as this domain uses it]

### User workflow
1. [step]
2. [step]

### Key data fields
- **[Field]**: [description]

### Design considerations
[Constraints, pain points, relevant manifest patterns/rules]

### Confidence notes
[What's uncertain or unverified]

### Open questions
[Leave empty — prototyping may add]
```

Keep it under 60 lines — it's input to a builder, not a report.

Opt-out variant: just Prompt, Intent, and
`Domain context: General exploration — skipped at user request.`

### Step 5 — Confirm audience

If research surfaced multiple plausible roles, `AskUserQuestion`: "Who is
this prototype for?" with the identified roles + "Someone else — I'll
describe them". Skip when there's one obvious answer (note the assumption in
the handoff).

### Step 6 — Build mode

**Always ask — never infer from prompt detail:**

> How would you like to approach this?
> 1. **One focused prototype** — a single polished screen, handoff-ready
> 2. **A quick sketch** — rougher, faster, for direction-checking

(1 → prototyping skill as normal; 2 → prototyping skill with `mode: sketch`
noted — it will skip polish passes and mock-data depth.)

### Step 7 — Hand off

Invoke the `prototyping` skill with: the context.md location/content, the
chosen build mode, any matched manifest patterns, and the confirmed audience.
Do not build anything yourself.
