---
name: critique
description: >
  Structured design critique of a completed prototype — reports issues but
  changes nothing. Use when the user runs /critique or asks to review,
  critique, or evaluate a prototype's design quality.
metadata:
  version: "1.0"
  category: quality
---

# Critique

Read-only: evaluate and report. Never edit files during a critique.

Load the target's `context.md`, the stack manifest (`patterns.md`, `rules.md`,
`voice.md`), and the source. Screenshot the live page if a browser tool is
available.

## Evaluate across dimensions

1. **Brief alignment (critical)** — does the screen answer `context.md`'s
   Intent for the stated audience? Does it use the brief's terminology and
   serve the stated workflow, step by step?
2. **Visual hierarchy** — is the most important thing visually dominant? Is
   there exactly one primary action?
3. **Information architecture** — grouping, ordering, and density match how
   the audience thinks about the task (per the brief), not how the data model
   is shaped.
4. **Component usage** — right manifest component for each job; variants
   semantically correct; patterns.md followed or knowingly diverged.
5. **Layout & spacing** — rhythm consistent; rules.md respected.
6. **States & edge cases** — empty, loading, error, long-content states exist
   and look intentional.
7. **Microcopy** — voice.md followed; labels informative, not generic.
8. **Handoff readiness** — data flows through the service seam; a developer
   could pick this up and know what to wire.

## Report

```
## Critique: <slug>

### Brief alignment verdict
[aligned / partially / misaligned — why, in 2-3 sentences]

### What's working
- ...

### Priority issues
1. [issue] — [why it matters] — [suggested direction] (file)

### Minor observations
- ...

### Questions to consider
- ...
```

Offer `/polish` (mechanical fixes) or a prototyping session (structural
changes) as follow-ups — but make no edits here.
