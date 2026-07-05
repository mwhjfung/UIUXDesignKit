---
name: getting-started
description: >
  Onboarding for new PDK users — environment checks, orientation, first
  design system, first prototype. Use when someone is new to the kit, asks
  how to get started, or the environment looks unconfigured.
metadata:
  version: "1.0"
  category: workflow
---

# Getting Started

Goal: from clone to first prototype (with the browser tooling working) in
about 30 minutes.

## Step 1 — Orient

One paragraph: "PDK is a workspace where you build real-code prototypes on
your organisation's design system. A catalogue app scaffolds and lists
prototypes; each prototype is its own small app; a browser toolbar lets you
annotate (I apply the fixes) and tweak component variants directly; when a
prototype is right, /handoff packages it for a developer."

## Step 2 — Environment check

```bash
node --version        # need >= 20
npm install           # repo root — installs workspaces, builds pdk-core
npm run dev           # catalogue → http://localhost:5170
```

Fix what fails before moving on. If `dist/tooling/pdk-tools.js` is missing,
`npm run build:tools`.

## Step 3 — Design system

Ask: "Which design system will you prototype with?"

- **Trying the kit / no answer** → use `react-shadcn` (reference stack,
  ready to go).
- **One of the shipped stacks** (vue-shadcn, react-material, react-atlaskit)
  → `cd stack-templates/<stack> && npm install`, then `/scaffold-manifest
  <stack>` if the manifest is stale, and suggest `/curate-manifest` to add
  team taste.
- **Their own system** → walk through `/scaffold-manifest`'s "Onboarding a
  brand-new design system" section (new stack template + designSystem config
  + scaffold + curate). This is the ~30-minute path.

Point at `docs/knowledge-sources.md`: "Optional but transformative — register
your org's knowledge sources (research repo, docs MCP) and every prototype
gets grounded in real domain context."

## Step 4 — First prototype

Hand off: "Tell me what you'd like to prototype — a screen, a flow, an idea.
I'll research context first, then build it." Then follow the enforced chain
(design-advisory → prototyping). After it renders, demo the loop: annotate
something in the browser → /markup; open the Tweak panel and change a
variant.

## Notes

- Never leave a beginner with a broken environment and a list of commands —
  fix it with them.
- If they just want to look around: catalogue at :5170, prototypes in
  `prototypes/`, the manifest concept in `stack-templates/react-shadcn/manifest/`.
