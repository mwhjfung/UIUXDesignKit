# Stack template: React + Atlaskit

Boilerplate for a new ProductDesignKit prototype using React 18 and the Atlassian Design System.

## What's included

- React 18 + TypeScript
- Vite 7
- `@atlaskit/button`, `@atlaskit/heading`, `@atlaskit/tokens`, `@atlaskit/css-reset`
- `annotate.js` wired via `<script src="http://localhost:5170/tooling/annotate.js">`
- `pdk.json` with placeholder values

## How to use

Don't clone this directly. Use the `new-prototype` skill in Claude Code — it copies this template, fills in the placeholders, and runs `npm install` for you.

To add more Atlaskit packages:

```bash
npm install @atlaskit/badge @atlaskit/tag @atlaskit/table-tree
```

See the [Atlaskit component catalogue](https://atlassian.design/components) for the full list.

## Port

The template uses port 5200. The `new-prototype` skill assigns the actual port when scaffolding.
