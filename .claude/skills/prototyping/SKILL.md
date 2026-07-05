---
name: prototyping
description: >
  The builder. Use when creating or modifying any prototype — normally
  invoked by the design-advisory skill with a domain brief. Covers stack
  selection, scaffolding via the catalogue API, manifest-driven component
  rules, the mock-service data seam, and modification workflow.
metadata:
  version: "1.0"
  category: workflow
---

# Prototyping

## Entry point

Normally invoked by `design-advisory` with a domain brief (context.md
content). If a user reached this skill directly asking to *build something
new*, stop and invoke `design-advisory` first. Direct entry is correct only
when **modifying an existing prototype** — then read its `context.md` before
touching anything.

## The manifest is law

1. Read the prototype's `pdk.json` → `stack`.
2. Read `stack-templates/<stack>/manifest/`:
   - `components.json` — the only components and variant values you may use
   - `patterns.md` — copy-pasteable layouts; start from these, don't invent
   - `rules.md` — do/don't; treat every entry as a review blocker
   - `voice.md` — all UI copy follows it
   - `icons.json` — check before using any icon name
3. Component not in the manifest? Options, in order: use the closest manifest
   component; add the component to the *template* properly (e.g.
   `npx shadcn@latest add <name>` for shadcn stacks) then re-run
   `/scaffold-manifest <stack>`; ask the user. Never hand-roll a lookalike
   and never invent variant values.

## Creating a new prototype

1. **Choose the stack.** Default to `react-shadcn` (the reference stack)
   unless the brief or user says otherwise. List options from
   `stack-templates/` if unsure.
2. **Scaffold via the catalogue API** (catalogue must be running —
   `npm run dev` at repo root):
   ```bash
   curl -s -X POST http://localhost:5170/__api/create-prototype \
     -H 'Content-Type: application/json' \
     -d '{"stack":"react-shadcn","name":"<slug>","description":"<one-liner>","author":"<user>"}'
   ```
   The response gives the assigned port. (No catalogue? Copy the template
   folder manually, replace the PROTOTYPE_* placeholder tokens, pick a free
   port 5171+, and add `"stack"` to pdk.json.)
3. **Write `context.md`** into the new folder (content from design-advisory).
4. **Install & run:** `cd prototypes/<slug> && npm install && npm run dev`.
5. **Build the screen** from the closest `patterns.md` pattern.

## Data rules — the handoff seam

- All data flows through `src/services/`: UI imports `api` from
  `@/services/api`, typed by `@/services/types`.
- New data need → extend the `Api` interface, implement in `api.mock.ts`,
  add fixtures. **Never inline mock arrays in components.**
- Mock data must look real for the domain (use the brief's terminology and
  field names; realistic quantities, dates, names, edge cases — one long
  value, one empty state).
- Every visible control works against the mock API. No dead buttons.

## Build conventions

- TypeScript strict; keep the domain model in `src/services/types.ts`.
- Components from `@/components/ui/*` only — no raw HTML twins (`<button>`,
  `<table>`, `<input>` are review rejects when a manifest component exists).
- Semantic tokens only (the stack's `rules.md` lists them); no raw palette
  values.
- Keep the prelude `<script>` tag in `index.html` — it powers the Markup
  toolbar and Tweaker.
- One file per screen region when a file passes ~200 lines; co-locate small
  components in the prototype's `src/components/` (NOT in `ui/` — that's the
  design system's).

## Modifying an existing prototype

1. Read `context.md`, then `pdk.json` (stack, port), then the source.
2. Keep changes inside the prototype folder; respect the manifest.
3. Update `context.md` when intent or scope changes; append to Open questions
   rather than deleting history.

## After building

1. Confirm the dev server renders without console errors.
2. Offer the loop: "Open http://localhost:<port> — annotate anything with the
   Markup toolbar (then run /markup), or use the Tweak button to try variant
   changes. Run /validate-prototype for a structured check."
3. Update the catalogue-visible fields in `pdk.json` (`description`, `tags`,
   `status`) if they drifted.
