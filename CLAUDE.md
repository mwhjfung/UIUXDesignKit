# Product Design Kit (PDK)

A white-label, design-system-agnostic workspace where designers build
code-real prototypes on *their organisation's* design system, tweak and
annotate them in the browser, and hand them to developers who connect real
endpoints and ship.

## Repo map

```
catalogue/            Vue app at :5170 — prototype gallery, New/Remix scaffolding,
                      serves /tooling/* (the injectable browser toolbar)
pdk-core/             @pdk/core — manifest schema/reader/scanners, prototype Vite
                      plugin (markup + tweaker + manifest endpoints), MCP bridge,
                      browser toolbar source (dist/tooling/pdk-tools.js)
stack-templates/      One folder per stack (react-shadcn ★reference, vue-shadcn,
                      react-material, react-atlaskit). Each contains a manifest/
                      — the design-system cheat sheet all tools read.
prototypes/           Standalone Vite apps copied from stack templates. Each has
                      pdk.json (identity: slug, stack, port, lineage).
tooling/              pdk-prelude.js — script tag prototypes include to load the toolbar
areas/                Research workstreams (brief + research per area)
docs/                 Working rules, decisions log, knowledge-source registry
```

## The prototyping flow (enforced)

**When a user asks to build/create a prototype, screen, or mockup, invoke the
`design-advisory` skill FIRST — always. Never invoke `prototyping` directly;
design-advisory hands off to it.** The only exception: modifying an existing
prototype — read its `context.md` and go straight to `prototyping`.

Chain: `design-advisory` (domain brief) → `prototyping` (build) →
`validate-prototype` (check) → `/polish` (refine). Browser feedback loops:
`/markup` (annotations → commits) and the Tweaker (variant changes → source
patches) run against the live prototype.

## The manifest is the source of truth

Every stack template has `manifest/`:
- `components.json` — component names, import paths, props, legal variants
- `tokens.json`, `icons.json` — scanned design tokens and icon names
- `patterns.md`, `rules.md`, `voice.md` — curated team knowledge

Before writing prototype code: read the prototype's `pdk.json` → `stack` →
read that stack's manifest. **Only use components, variants, and icons that
exist in the manifest.** Missing something? `/scaffold-manifest` re-scans;
never invent.

## Prototype anatomy

Each prototype folder: `pdk.json` (machine identity — don't hand-edit ports),
`context.md` (intent, domain brief, constraints — read before modifying
anything), `src/` (the app), `src/services/` (typed mock data seam — all data
flows through it).

## Safety rules

- DO read `context.md` before modifying any existing prototype.
- DO keep every prototype change inside that prototype's folder.
- DO route new data needs through `src/services/` (extend the `Api` interface
  + mock), never inline arrays in components.
- DO NOT edit `stack-templates/*/` from inside a prototype task (manifest
  updates go through /scaffold-manifest, /curate-manifest, /sync-manifest).
- DO NOT edit `manifest/patterns.md`, `rules.md`, `voice.md` outside the
  /curate-manifest flow, and never edit them from /sync-manifest.
- DO NOT scan `prototypes/` unless the user names a prototype.
- DO NOT start a dev server if one is already running on that port.
- DO NOT put organisation-proprietary content in this repo if it is public —
  knowledge sources are referenced via `docs/knowledge-sources.md`, not vendored.

## Dev commands

```bash
npm install            # root: workspaces (pdk-core + catalogue), builds pdk-core
npm run dev            # catalogue at http://localhost:5170
npm test               # pdk-core unit tests
npm run test:smoke     # scanner smoke tests against real templates (slow)
npm run build:tools    # rebuild dist/tooling/pdk-tools.js after toolbar changes
cd prototypes/<slug> && npm install && npm run dev   # run a prototype
```

## Git conventions

Branch: `<initials-or-handle>/<kebab-description>`. Markup fixes: one commit
per annotation (`fix: <comment>`). Log platform-level decisions in
`docs/decisions.md` (newest first).
