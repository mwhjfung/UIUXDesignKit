---
name: validate-prototype
description: >
  Use after building or significantly modifying a prototype, or when asked to
  validate, check, or review one. Static audit against the stack manifest +
  build check + (when a browser is available) visual smoke test, ending in a
  concise scorecard.
metadata:
  version: "1.0"
  category: quality
---

# Validate Prototype

Identify the target: the prototype just worked on, or ask. Read its
`pdk.json` (stack, port) and `context.md`, and load the stack manifest.

## Phase 1 — Static audit

Run every check; report pass/fail with file:line for failures.

1. **Manifest components only** — every component imported from
   `@/components/ui/*` exists in `components.json`; no raw HTML twins of
   manifest components (`<button>`, `<table>`, `<input>`, `<select>`).
2. **Legal variants** — every literal prop value on a manifest component is
   one of its `options` in `components.json`.
3. **Icons exist** — every icon name/import appears in `icons.json`.
4. **Token discipline** — no raw palette classes or hex/oklch literals in
   prototype source (tokens live in the design system, not screens).
5. **Service seam intact** — no inline data arrays in components; all data
   imports come from `@/services/*`; `api.ts` types cover what the UI uses.
6. **Rules.md compliance** — check each explicit do/don't from the stack's
   `rules.md` that is mechanically checkable; list the rest as "manual
   review" items.
7. **Prelude present** — `index.html` still carries the pdk-prelude script tag.
8. **pdk.json sane** — slug matches folder, stack exists, port is a number.
9. **context.md current** — exists, has Prompt/Intent, mentions the screens
   that actually exist.

## Phase 2 — Build & runtime

1. `npm run build` in the prototype — must pass (typecheck + bundle).
2. If the dev server is running and a browser tool is available (Claude in
   Chrome, Playwright, or the `verify` skill): load the page, check for
   console errors, confirm the toolbar mounts, screenshot for the report.
   Otherwise mark "runtime: not checked" — never claim visual checks you
   didn't run.

## Phase 3 — Report

```
## Validation: <slug>
Build: PASS/FAIL
Static audit: N pass / N fail
  ✗ [check] — file:line — one-line fix
Manual review: [rules.md items needing human eyes]
Runtime: [checked/not checked + findings]
Verdict: ready for polish / needs fixes first
```

Offer next steps: fix the failures now, or run `/polish` if clean.
