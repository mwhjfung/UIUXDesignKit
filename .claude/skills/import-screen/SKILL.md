---
name: import-screen
description: >
  Start a new prototype from an existing screen in a linked product repo.
  Use when the user runs /import-screen <screen>, or asks to "build off",
  "start from", "copy", or "iterate on" an existing screen/page of their
  product.
metadata:
  version: "1.0"
  category: workflow
---

# Import screen — /handoff in reverse

Creates a prototype whose starting point is a real screen from a linked
product repo, running on fake data shaped by the product's real types.
The screen's UI comes along; its plumbing does not.

## Preconditions

- The prototype's stack has a `linkedRepos` entry with `role: "product"`
  (read `stack-templates/*/pdk.json`). None → suggest /link-repo first.
- The catalogue dev server is running (:5170) — needed for scaffolding.

## Step 1 — Locate the screen

Search every linked product repo's screen dirs (src/pages, src/routes,
src/screens, src/views, app/) and route tables for the user's description
(file path, route, or plain-English name). Several matches → list them
with one-line descriptions and ask. Say which repo matched when there are
several product repos.

## Step 2 — Scaffold the prototype

POST to the catalogue create API (same call the prototyping skill documents)
with the linked stack. Then add to the new prototype's `pdk.json`:

    "importedFrom": { "repo": "<repoPath>", "screen": "<relPath>",
                      "commit": "<gitHead or null>" }

## Step 3 — Extract with dependency triage

Walk the screen's import graph from its file outward. Classify EVERY import:

| Kind | Action |
|------|--------|
| Design-system components (vendored ui / DS package) | Already in the template — rewrite the import path |
| Presentational components, pure utils, types | Copy into the prototype, preserving relative structure |
| Data fetching (query hooks, fetch/axios, GraphQL), state stores, auth
  contexts, feature flags, analytics, i18n, router hooks | **Sever** — replace with props, local state, and calls through `src/services/api.ts` |

Severing rules:
- Route params → fixture values surfaced as constants at the top of App.
- Auth/permissions → a `currentUser` fixture in the mock layer.
- Feature flags → resolve to the branch the user asks for (ask if unclear).
- Conditional variants you cannot resolve → keep the richer branch and note
  it in context.md.

## Step 4 — Mock layer from real types

Copy the screen's data types from the product repo into
`src/services/types.ts` (trim to what the screen uses). Extend the `Api`
interface with the operations the screen performs; implement them in
`api.mock.ts` with fixtures fabricated to those real shapes. NEVER wire a
real endpoint, hardcode a credential, or point at a non-mock base URL —
refuse and explain that connecting real data is the /handoff step.

## Step 5 — Validate honestly

Run the prototype's typecheck and build; open it and confirm it renders.
Then write into `context.md`:

- what screen this came from (repo, path, commit)
- everything severed and what replaced it
- behaviour that may differ from production (permissions, flags, realtime)
- what was NOT imported (child routes, modals out of scope)

Offer /validate-prototype for the full pass.

## When extraction fails

If the screen cannot be made to render standalone (unresolvable coupling),
stop patching. Report exactly what refused to sever, then offer the
fallback: rebuild the screen fresh from the manifest using the original
source as visual reference (invoke the prototyping skill with the screen
file attached as context). A clean rebuild beats a haunted extraction.
