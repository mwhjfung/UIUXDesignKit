---
name: scaffold-manifest
description: Scan a stack template's design system and generate its manifest (components.json, tokens.json, icons.json plus curated-file stubs). Use when onboarding a new design system, after adding a stack template, or when the user runs /scaffold-manifest <stack>.
---

# Scaffold a design-system manifest

The manifest is the per-stack cheat sheet every PDK tool reads (Tweaker, wizard,
validation, handoff). This skill fills in the **scannable** half; the curated
half is `/curate-manifest`.

## Steps

1. Identify the stack name — a folder under `stack-templates/`. If the user
   didn't say which, list the folders and ask.
2. Make sure the design system is installed in the template:
   ```bash
   cd stack-templates/<stack> && npm install
   ```
3. Make sure pdk-core is built, then run the scaffolder from the repo root:
   ```bash
   npm run build:core
   node pdk-core/dist/manifest/scaffold.js <stack> --root .
   ```
4. Relay the report (component/token/icon counts and warnings) to the user.
   If items were skipped, summarize `stack-templates/<stack>/manifest/_unscanned.txt`.
5. Spot-check `manifest/components.json`: are the flagship components there
   (Button, Card, form controls)? If a scan came up empty, do NOT hand-write
   guesses — tell the user what was missing and offer to seed entries together
   from the design system's docs.
6. Point the user at the next step: `/curate-manifest <stack>` fills in
   patterns.md, rules.md, and voice.md — the taste that makes output good.

## Onboarding a brand-new design system

If there is no stack template yet:

1. Create `stack-templates/<framework>-<system>/` by copying the closest
   existing template (react-shadcn for React, vue-shadcn for Vue).
2. Replace the design-system dependencies in `package.json`, run `npm install`.
3. For npm-packaged systems, add a `designSystem` block to the template's
   `pdk.json` so the scaffolder knows what to scan:
   ```json
   "designSystem": {
     "type": "package-types",
     "packages": ["@mantine/core"],
     "iconPackages": ["@tabler/icons-react"],
     "tokenFiles": ["src/assets/index.css"]
   }
   ```
   (Copy-installed shadcn-style systems are inferred automatically as
   `local-cva`.)
4. Continue from step 3 above.

## Failure modes

- **"No components found"** — the design system isn't installed, or it has no
  TypeScript declarations. Never fabricate entries; report and offer manual seeding.
- **Unknown library** — the error message shows the exact `designSystem` block
  to add to pdk.json.
