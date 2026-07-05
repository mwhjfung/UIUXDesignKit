# /link-repo — connect the kit to an existing product codebase

**Status: DRAFT — screen import confirmed in scope by user (2026-07-05).**

## Problem

Today, pointing the kit at an organisation's design system is manual: copy
the closest stack template, swap dependencies, run `/scaffold-manifest`, sit
through `/curate-manifest`, register knowledge sources, and remember the
product repo's path every time you run `/handoff`. A new user shouldn't have
to do archaeology on their own codebase before the kit is useful.

`/link-repo <path>` makes the product repo the input: the kit reads it,
builds a matching stack template + manifest automatically, learns the
product's conventions from its real screens, and remembers the repo as the
default handoff target.

## Scope decisions (user-confirmed)

1. **Link depth = design system + conventions + screens.** The linked repo's
   screens seed `patterns.md` / `rules.md` at link time, and any individual
   screen can be imported **on demand** as the starting point of a new
   prototype (`/import-screen`, below). Screens run on fake data by design —
   connecting real endpoints stays the developer's step, via /handoff.
2. **Sync is explicit.** The link records path + commit SHA; `/sync-manifest`
   learns to refresh from the linked repo. No file watching.
3. **The linked repo becomes the default `/handoff` target.**
4. **Input is a local clone path.** A GitHub URL is accepted but simply
   cloned to a sibling directory first.
5. **More than one repo can be linked, each with a role.** The common shape
   is a *design-system repo* (source of truth for components, tokens,
   icons) plus a *product repo* (source of screens and conventions, and the
   handoff target). Several product repos may share one linked design
   system — they all attach to the same stack template.

## Approaches considered

- **A. Skill-only** — the AI inspects the repo ad hoc and hand-writes a
  template. Zero new engine code, maximally flexible — but non-deterministic,
  untestable, and slow every single time.
- **B. TS engine + thin skill (chosen)** — detection, template generation,
  and link metadata live in `pdk-core` under vitest; the skill layer handles
  only judgement calls (ambiguity, convention mining, curation confirmation).
  Matches the kit's standing decision that "skills are thin wrappers over
  vitest-covered TS."
- **C. Bulk screen conversion at link time** — convert every screen into a
  prototype up front. Rejected: screens are nodes in a dependency graph
  (state stores, auth contexts, router hooks, buried data-fetching, feature
  flags), so bulk extraction fails opaquely and at scale. Instead, screen
  import ships as **on-demand extraction of one chosen screen** (see
  `/import-screen`), which keeps failures small, visible, and per-screen.

## User experience

```
/link-repo ~/work/acme-design-system     # optional, if the DS lives separately
/link-repo ~/work/acme-app
```

1. Kit inspects each repo and infers its **role** from what it finds — a
   package of components with no screens reads as a design-system repo; an
   app with routes/pages reads as a product repo (confirmable either way).
   It reports: *"React 18 + vendored shadcn-style components
   (src/components/ui, 41 components), tokens in src/styles/globals.css,
   lucide-react icons. Link as product repo on stack 'acme'?"* When a
   product repo consumes an already-linked design system, the kit attaches
   it to that existing stack instead of creating a new one.
2. On confirm, it generates `stack-templates/acme-app/`, scans the manifest,
   and mines conventions from the repo's screens into draft
   `patterns.md`/`rules.md`.
3. A **shortened curation pass**: instead of the ~30-minute blank-page
   interview, the user reviews mined drafts — confirm / correct / delete.
4. Done: the catalogue's New-prototype dialog now offers the linked stack;
   `/handoff` defaults to the linked repo.
5. From then on, `/import-screen "timesheet approval"` starts a new
   prototype from that real screen — running on structurally-true fake
   data — instead of from a blank template.

If detection is ambiguous (monorepo with several apps, multiple candidate
DS packages, no recognisable system), the skill asks instead of guessing.

## Architecture

Three layers, mirroring the kit's existing seams:

### 1. `pdk-core/src/manifest/link.ts` (new, tested)

- `inspectRepo(repoPath)` → `RepoReport`:
  - workspace-aware package.json discovery (root + workspaces/pnpm-workspace)
  - framework detection: react/vue + version, per candidate app
  - design-system detection, reusing the existing scanner taxonomy:
    - **local-cva** — a vendored `components/ui`-style directory whose files
      use CVA (same signal `scanLocalUi` already keys on)
    - **package-types** — DS packages in dependencies (`@mui/*`,
      `@atlaskit/*`, org-scoped `@<org>/design-system`-shaped packages with
      `.d.ts`)
  - token-file candidates (CSS with `:root` / `@theme` blocks), icon
    packages, font packages
- `generateTemplate(report, opts)` → writes `stack-templates/<name>/`:
  - chassis = closest built-in template (react-shadcn or vue-shadcn) for
    vite config, tsconfig, prelude script tag, `@pdk/core` wiring,
    `src/services/` seam
  - DS dependencies mirrored **at the linked repo's exact versions**
  - vendored `components/ui` + token CSS copied in (local-cva case)
  - `pdk.json` gains a `designSystem` block (existing scanner contract) plus
    a **list** of linked repos, each with a role:
    ```json
    "linkedRepos": [
      { "role": "design-system", "path": "/abs/path/acme-design-system",
        "commit": "<sha>", "linkedAt": "2026-07-05", "appDir": "." },
      { "role": "product", "path": "/abs/path/acme-app",
        "commit": "<sha>", "linkedAt": "2026-07-05", "appDir": "apps/web" }
    ]
    ```
  - **Merge rules when both roles are present**: the design-system repo is
    the source of truth for component/token/icon *scanning* (source-level
    CVA and token files beat `.d.ts` archaeology in node_modules); the
    product repo is the source of truth for *versions in use* (its
    lockfile pins the mirrored dependencies) and for screens/conventions.
    With only a product repo linked, its vendored components or installed
    DS packages are scanned instead — exactly the current scanner paths.
- `syncLink(templateDir)` — used by `/sync-manifest`: for **each** linked
  repo, compares its current commit to the recorded one; re-copies vendored
  ui + tokens from the design-system source, re-pins versions from the
  product repo, then delegates to the existing manifest sync (which already
  diffs and flags stale curated prose).

### 2. `.claude/skills/link-repo/SKILL.md` (new)

Orchestrates: run inspection → present findings + inferred role →
confirm/disambiguate → attach to an existing stack or generate a new
template → `npm install` in template → run `scaffoldManifest` →
**convention mining** (product repos only) → shortened curation
confirmation → register the repo in `docs/knowledge-sources.md`
(design-system repo: `trust: authoritative` — its docs/stories are the
official word on component usage; product repo: `trust: additive`) →
report. Linking a second repo re-runs only the parts its role owns.

Convention mining (AI judgement, deliberately not TS): read a sample of the
repo's screens/routes; draft `patterns.md` (recurring layout wrappers,
component co-occurrence, empty/loading/error handling) and `rules.md`
(observed do/don'ts, spacing and variant habits) and `voice.md` (tone of
real UI strings). Drafts carry a `<!-- pdk:mined -->` marker until the user
confirms them, at which point the marker is removed. `isStubMd()` in
`pdk-core/src/manifest/read.ts` is extended to recognise `pdk:mined`
alongside `pdk:stub`, so unconfirmed drafts read as not-yet-curated
everywhere the kit already checks.

### 3. `.claude/skills/import-screen/SKILL.md` (new) — build off an existing screen

`/import-screen <screen>` (a route, file path, or plain-English name —
"the timesheet approval page") creates a new prototype whose starting point
is a real screen from the linked repo. Conceptually it is **/handoff in
reverse**, and it reuses the same seam.

Flow:

1. **Locate** the screen in a linked *product* repo (route tables, pages/
   dirs, filename match). Several product repos → search all, say which one
   matched. Ambiguous → list candidates and ask.
2. **Scaffold** a fresh prototype from the linked stack template via the
   existing catalogue create API (`pdk.json` records
   `importedFrom: { screen, commit }` alongside remix-style lineage).
3. **Extract with dependency triage.** Walk the screen's import graph and
   classify every dependency:
   - *design system* → already in the template; rewrite import paths
   - *pure UI / presentational / utils* → copy into the prototype
   - *data fetching, state stores, auth, feature flags, analytics, i18n,
     router* → **sever**: replace with calls through `src/services/api.ts`
     and props/local state
4. **Generate the mock layer from real types.** The app's own TypeScript
   types for the severed data become `services/types.ts`; fixtures are
   fabricated to those shapes so the fake data is structurally true. Route
   params, auth roles, and flag states become named fixture scenarios.
5. **Validate honestly.** Build + render the prototype; then write the
   stub report into `context.md`: what was severed, what behaviour may
   differ from production (permissions, flags), what wasn't imported.
   The Api interface built here is exactly what /handoff later turns into
   the developer's endpoint checklist — fake data in, connect-the-endpoints
   out, as designed.
6. **Failure is a defined outcome**: if extraction can't produce a rendering
   screen (unresolvable coupling), report why and offer the fallback —
   rebuild the screen fresh from the manifest using the original as the
   visual reference (`prototyping` skill with the screen's source attached
   as context).

No new pdk-core engine code is required for v1 of this skill: extraction is
AI-judgement work by nature (the classification in step 3), backed by the
existing scaffold/create APIs, service-seam convention, and validation
skill. If recurring mechanical parts emerge (import-graph walking), they
graduate into tested TS later, per the kit's standing decision.

### 4. Touch-ups to existing pieces

- `/handoff`: when the prototype's stack has linked repos, default the
  target to the *product* repo's path (+ suggested subdirectory); if the
  prototype was imported from a screen, default to that screen's repo; with
  several product repos and no import lineage, ask which.
- `/sync-manifest`: call `syncLink()` first when the stack has `linkedRepos`.
- Catalogue: no changes needed — generated templates appear automatically in
  `GET /__api/stacks`.
- README/CLAUDE.md: document the linked-repo flow as the recommended path;
  the manual copy-a-template flow remains for design systems that live
  nowhere (greenfield).

## Error handling

- **No recognisable design system** → report what was looked for, offer the
  manual flow (`designSystem` block authored by hand), don't scaffold junk.
- **Monorepo, multiple apps/DS candidates** → list candidates, ask.
- **Role conflict** (two repos both claiming design-system for one stack, or
  a DS repo whose scan disagrees with the product repo's vendored copies) →
  the design-system repo wins for scanning, and the discrepancy is reported
  rather than silently blended (same rule knowledge-sources already uses).
- **Framework unsupported** (not React/Vue) → stop with a clear message;
  don't attempt a chassis that can't render the components.
- **Linked repo moved/deleted at sync or handoff time** → surface the stored
  path and ask for the new one; update `linkedRepo.path`.
- **Vendored-ui copy conflicts at handoff** → already handled by /handoff's
  divergence notes (kit copies are skipped when the target has its own).

## Testing

- Unit: `inspectRepo` against four fixture repos (vendored-shadcn app,
  packaged-DS app, standalone design-system repo, monorepo with two apps —
  including role inference for each); `generateTemplate` output shape
  (pdk.json contract, dependency pinning, chassis files present) plus the
  DS-repo + product-repo **merge rules**; `syncLink` commit-drift behaviour
  across multiple linked repos.
- Smoke: link a scratch repo end-to-end → template builds, manifest scans,
  a prototype scaffolds from the new stack and serves `/__pdk/manifest`.
- Screen import (skill-driven, so exercised not unit-tested): a fixture app
  with one deliberately-entangled screen (store + router + fetch hook);
  `/import-screen` must produce a rendering prototype whose data flows only
  through `src/services/`, with the severed pieces listed in `context.md`.

## Out of scope (v2 candidates)

- Bulk conversion of all screens at link time (import stays per-screen,
  on demand).
- Live watching of the linked repo.
- Automatic cross-repo version reconciliation (e.g. warning when the DS
  repo's main is ahead of what the product repo ships) beyond the simple
  commit-drift report `/sync-manifest` gives.
