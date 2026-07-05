---
name: handoff
description: >
  Export a finished prototype into a developer's codebase: copies the source,
  strips PDK-only artifacts, adapts imports, and writes a HANDOFF.md whose
  endpoint checklist is derived from the prototype's typed service seam. Use
  when the user runs /handoff <slug> <target-repo-path> or asks to hand a
  prototype to developers / export it / make it shippable.
metadata:
  version: "1.0"
  category: workflow
---

# Handoff — export a prototype to a real codebase

The end of the PDK loop: a developer picks up the prototype, implements the
`Api` interface against real endpoints, and ships. Your job is to make that
a checklist, not an archaeology dig.

## Inputs

- **slug** — folder under `prototypes/`
- **target** — absolute path to the developer's repo (+ optional
  subdirectory for the code, e.g. `src/features/<slug>`; suggest that as
  the default). When the prototype's stack template has `linkedRepos`,
  default the target instead of asking: the prototype's
  `pdk.json.importedFrom.repo` if present, else the single
  `role: "product"` entry's path; with several product repos and no import
  lineage, list them and ask which.

Ask for whichever is still missing.

## Step 1 — Pre-flight

1. Prototype exists; read its `pdk.json`, `context.md`.
2. Recommended (not required): validation — offer to run
   `/validate-prototype` first if it hasn't been run this session.
3. Target is a git repository with a **clean working tree** (`git -C <target>
   status --porcelain` empty). Dirty → stop and tell the user; never mix a
   handoff into uncommitted work.
4. Detect target conventions: package.json (framework + package manager),
   tsconfig `paths` (aliases), whether it already uses the same design system
   (e.g. existing `components/ui/` with shadcn, or the DS package in
   dependencies), and its Tailwind/token setup.
5. **Framework mismatch** (React prototype → Vue repo, etc.): stop and say
   so — a handoff is a copy, not a rewrite. Offer the HANDOFF.md alone as a
   spec instead.

## Step 2 — Copy

Into `<target>/<subdir>`:

- `src/` of the prototype, **excluding** PDK artifacts:
  - drop `pdk.json` (its facts go into HANDOFF.md instead)
  - strip the pdk-prelude `<script>` tag if any html is copied
  - drop `vite-env.d.ts` if the target has its own
- **Design-system components** (`src/components/ui/*`): if the target already
  vendors the same components, skip duplicates and diff any that differ —
  list divergences in HANDOFF.md rather than overwriting the target's copies.
  If the target has none, copy them and say so (they become the target's).
- **Token CSS** (`src/assets/index.css`): never overwrite target styles. If
  the target lacks the token layer, copy it under the subdir and note the
  import that must be added.
- `context.md` → `<subdir>/DESIGN-CONTEXT.md` (the domain brief travels with
  the code).

## Step 3 — Adapt

- Rewrite import aliases to the target's convention (their tsconfig paths; if
  none, relative imports).
- Point everything at the target's package manager/framework versions — flag
  (don't silently fix) real incompatibilities (e.g. prototype on React 19,
  target on 17).
- List any dependencies the target is missing (CVA, lucide, radix, etc.) and
  add them via the target's package manager **only with the user's OK**.

## Step 4 — Write HANDOFF.md

Use `handoff-template.md` (next to this skill). The core section is the
**endpoint checklist**: parse `src/services/api.ts`'s `Api` interface and
emit one checklist item per method with its exact TypeScript signature —
"implement against your real backend" — plus the final step "delete
api.mock.ts and the fixtures". Also include: what the prototype does (from
context.md), component inventory (from the stack manifest for the components
actually used), token/theming notes, states implemented, known gaps (from
context.md Open questions).

## Step 5 — Verify in the target

Run the target's own typecheck/build scripts if they exist. Report results
honestly; fix import-path errors you caused, but **do not** half-fix
pre-existing target issues — list them.

## Step 6 — Finish

Summarize files copied/skipped/adapted + verification result. Suggest the
developer starts at HANDOFF.md. Offer to commit on a branch in the target
(e.g. `handoff/<slug>`) — with the user's confirmation, never silently.
