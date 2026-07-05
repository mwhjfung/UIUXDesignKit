---
name: polish
description: >
  Final quality pass for a prototype after validation passes — fixes
  alignment, spacing, prop correctness, label consistency, and mock data
  quality against the stack manifest. Use when the user runs /polish or asks
  to polish, tighten, or clean up a prototype.
metadata:
  version: "1.0"
  category: quality
---

# Polish

Prerequisite: `/validate-prototype` passes. Polish refines what already works
— it doesn't fix broken structure.

Identify the target prototype, load its `context.md` and the stack manifest
(`patterns.md`, `rules.md`, `voice.md` drive every judgement below).

## Pass systematically

**Structure & order** — sections follow the pattern in `patterns.md` for this
screen archetype; most important content first; related fields grouped.

**Layout proportions** — consistent column rhythm; controls sized to their
content (a 3-char code doesn't get a full-width input); alignment matches the
pattern skeletons.

**Labels & copy** — every label/button/empty state follows `voice.md` (case,
verb style, terminology). Terminology matches `context.md`'s Key terminology
section exactly — one noun per concept.

**Prop correctness** — variant/size/state props are the *semantically* right
choice from `components.json`, not just legal (destructive for destructive,
one primary action per view).

**Spacing & rhythm** — spacing follows `rules.md`; no ad-hoc margins
compensating for structure problems.

**Mock data quality** — realistic for the domain (brief's field names, real
quantities/dates/names), includes one long value and sensible empty states;
all data still flows through `src/services/`.

**Code quality** — dead code and unused imports removed; types still strict;
files that grew past ~200 lines split.

## Verify & summarise

Re-run `npm run build`. Confirm the page renders. Then:

```
## Polish: <slug>
- [category]: [what changed] (file)
Skipped: [anything intentionally left, with reason]
```

One commit: `polish: <slug>`.

Principles: don't redesign — refine. Don't add features. When a fix would
contradict `context.md` intent, ask instead of "improving".
