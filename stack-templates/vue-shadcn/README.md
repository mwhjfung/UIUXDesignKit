# Stack template: Vue 3 + shadcn-vue

Boilerplate for a new ProductDesignKit prototype using Vue 3, Tailwind CSS v4, and shadcn-vue.

## What's included

- Vue 3 + TypeScript
- Vite 7
- Tailwind CSS v4 (CSS-first, no config file)
- shadcn-vue token layer pre-wired (`src/assets/index.css`)
- `Button` component pre-installed (`src/components/ui/button/`)
- `cn()` utility (`src/lib/utils.ts`)
- Inter Variable font
- `annotate.js` wired via `<script src="http://localhost:5170/tooling/annotate.js">`

## How to use

Don't clone this directly. Use the `new-prototype` skill in Claude Code — it copies this template, fills in the placeholders, runs `npm install`, and adds any additional components you need.

## Adding more shadcn-vue components

After `npm install`, add components from the shadcn-vue registry:

```bash
npx shadcn-vue@latest add card
npx shadcn-vue@latest add input select badge table dialog
```

Components land in `src/components/ui/` as plain `.vue` files. Edit them freely.

## Token layer

To retheme for a specific design system, replace the `:root` block in `src/assets/index.css` with that system's colour, radius, and spacing values.

## Port

The template uses port 5200 as a placeholder. The `new-prototype` skill assigns the actual port when scaffolding.
