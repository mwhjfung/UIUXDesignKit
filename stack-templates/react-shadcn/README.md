# Stack template: React + shadcn/ui

The PDK reference stack: React 19, Vite 7, Tailwind CSS v4, shadcn/ui.

## What's included

- React 19 + TypeScript, Vite 7
- Tailwind CSS v4 (CSS-first, no config file)
- shadcn/ui token layer pre-wired (`src/assets/index.css`)
- 14 shadcn/ui components pre-installed (`src/components/ui/`): button, card,
  input, label, select, checkbox, dialog, dropdown-menu, table, tabs, badge,
  separator, sheet, tooltip — all emitting `data-slot` attributes the PDK
  Tweaker uses to find instances
- Typed mock service layer (`src/services/`) — the UI talks to an `Api`
  interface backed by fixtures; developers swap in real endpoints at handoff
- `cn()` utility (`src/lib/utils.ts`), Inter Variable font
- PDK dev plugin (`pdkPrototypePlugin` in `vite.config.ts`) — serves the
  design-system manifest and the annotation/tweak APIs
- PDK prelude wired in `index.html` — loads the annotation + tweaker toolbar
  from the catalogue dev server when it's running

## How to use

Don't run this template directly. Create a prototype from the catalogue
(**New prototype** at http://localhost:5170) or ask Claude to build one —
the scaffolder copies this folder, fills in the placeholders, and assigns a
port.

## Adding more shadcn/ui components

```bash
npx shadcn@latest add accordion avatar popover progress
```

If the CLI drops files into a literal `@/` folder, move them to
`src/components/ui/`. Then refresh the manifest:

```bash
node ../../pdk-core/dist/manifest/scaffold.js react-shadcn --root ../..
```

## The service seam

UI code imports data access from `@/services/api` only. `api.mock.ts`
implements the interface against `fixtures/*.json` with simulated latency.
At handoff, a developer implements `Api` against real endpoints and deletes
the mock — no UI changes. Keep every new data need on this seam.

## Token layer

To retheme for your organisation's design system, replace the `:root` block in
`src/assets/index.css` with your tokens, then re-run the manifest scaffolder.
