---
name: link-repo
description: >
  Connect the kit to an existing codebase so prototypes build on its design
  system and conventions. Use when the user runs /link-repo <path>, gives a
  repo and asks to "link"/"connect"/"point the kit at" it, or asks to set up
  the kit against their product or design-system repo.
metadata:
  version: "1.0"
  category: workflow
---

# Link repo — connect the kit to a real codebase

Linking builds a stack template straight from the user's repo(s): the design
system is scanned, conventions are mined from real screens, and /handoff
learns where finished work goes. Roles: a **design-system** repo is the
source of truth for components/tokens/icons; a **product** repo supplies
screens, conventions, dependency pins, and the handoff target. Both can be
linked to one stack; several product repos may share a design system.

## Inputs

- **repo path** — local clone. Given a GitHub URL, clone it to a sibling
  directory of this kit first (ask before cloning).
- Optional: which stack to attach to (default: derived from the repo name).

## Step 1 — Inspect

    npx tsx pdk-core/src/manifest/link.ts inspect <repoPath>

Read the JSON `RepoReport`. Then confirm with the user, in plain language:
framework, what design-system source was found (vendored dir vs packages),
token files, icon packages, and the **inferred role**. Rules:

- `inferredRole` null + multiple candidates (monorepo): list candidates
  (dir, name, screens?, DS?), ask which to link and as what role.
- A candidate consuming an `@org/design-system`-style package that matches
  an already-linked design-system repo: attach to that existing stack.
- Framework neither React nor Vue: stop — explain the chassis limitation.
- Nothing detected: show what was looked for; offer the manual flow
  (hand-authored `designSystem` block per CLAUDE.md).

## Step 2 — Attach

    npx tsx pdk-core/src/manifest/link.ts attach <stack> \
      --repo <repoPath> --role <product|design-system> \
      [--app-dir <candidateDir>] --root .

Creates `stack-templates/<stack>/` on first attach (chassis + vendored
ui/tokens + version pins), records the link in pdk.json `linkedRepos`.
If this is a **second** repo on an existing stack, immediately run
`/sync-manifest <stack>` so the design-system copies win per the merge
rules. Then `npm install` inside the new template.

    Known limitation: if the FIRST linked repo provided no vendored ui or
    token file, a later design-system attach copies files but does not yet
    rewrite the template's designSystem block or CSS import — check
    pdk.json's designSystem config manually in that case.

## Step 3 — Scan

    npx tsx pdk-core/src/manifest/scaffold.ts <stack> --root .

Report component/token/icon counts and any warnings verbatim.

## Step 4 — Mine conventions (product repos only)

Read a representative sample of the product repo's screens (5-10 files from
its pages/routes dirs, plus any layout components they share). Draft:

- `manifest/patterns.md` — recurring page skeletons with REAL component
  names from components.json (list page, detail page, form page, empty
  states) as observed, not invented.
- `manifest/rules.md` — observed do/don'ts: spacing habits, variant usage,
  destructive-action treatment, form layout.
- `manifest/voice.md` — tone of actual UI strings: capitalisation, button
  labels, error message style.

Every drafted file MUST start with:

    <!-- pdk:mined — drafted from <repo> screens on <date>. Confirm via the
         shortened curation pass below, then delete this line. -->

Until that marker is removed the kit treats the file as uncurated.

## Step 5 — Shortened curation pass

Walk the user through each mined file section by section: confirm, correct,
or delete. On confirmation of a file, remove its `pdk:mined` line. Do not
paraphrase away the user's corrections — their wording wins.

## Step 6 — Register knowledge source + report

Add the repo to `docs/knowledge-sources.md`: design-system repo →
`trust: authoritative` (its docs/stories are the official word on component
usage); product repo → `trust: additive`. Use the `path` source format
already documented in that file.

Final report: stack name, counts, mined files awaiting confirmation, and
the two things now unlocked — "New prototype → <stack>" in the catalogue,
and `/import-screen <name>` to start from a real screen.

## Never

- Never copy organisation-proprietary docs/data into this repo — link paths
  in knowledge-sources.md instead.
- Never edit the linked repo itself. Linking is read-only.
- Never regenerate an existing template over uncommitted changes — check
  `git status` for `stack-templates/<stack>` first.
