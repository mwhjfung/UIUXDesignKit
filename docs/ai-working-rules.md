# AI working rules

Guidelines for AI tools operating inside prototypes in this repo. (CLAUDE.md
is the authoritative summary; this file adds detail.)

## File reading order when entering a prototype

1. **pdk.json** — identity: slug, stack, port, status, lineage (`parent`)
2. **context.md** — intent, domain brief, constraints. Read before ANY change.
3. **src/services/types.ts + api.ts** — the domain model and data seam
4. **src/App.tsx / App.vue** — the screen itself
5. **The stack manifest** — `stack-templates/<stack>/manifest/` (components,
   patterns, rules, voice)

## Interpretation rules

- `pdk.json` is the source of truth for machine-readable metadata. Don't
  hand-edit `defaultPort` (ports are assigned by the catalogue) or `slug`.
- `stack` links the prototype to its stack template; the manifest there
  governs which components, variants, tokens, and icons are legal.
- `parent` records remix lineage — the parent's `context.md` may add context.

## Safety boundaries

### DO
- Read `context.md` and the stack manifest before making changes
- Keep prototype changes inside the prototype folder
- Route all data through `src/services/` (extend `Api` + mock, never inline
  arrays in components)
- Update `context.md` when intent or scope changes
- Add entries to `docs/decisions.md` for kit-level choices

### DO NOT
- Modify `stack-templates/*` from inside a prototype task — template and
  manifest changes go through the manifest skills
- Edit `manifest/patterns.md`, `rules.md`, `voice.md` outside /curate-manifest
- Create raw HTML elements when a manifest component exists
- Use component variants, tokens, or icons that aren't in the manifest
- Remove the pdk-prelude `<script>` tag from `index.html`
- Start a dev server if one is already running on that port
- Run `git checkout HEAD --` on files without checking with the user first

## Per-stack code context

Read the truth from the stack template rather than assuming, but as
orientation for the reference stack (react-shadcn): React 19 +
`<script setup>`-free function components, Tailwind CSS v4 (CSS-first, tokens
in `src/assets/index.css`), shadcn/ui in `src/components/ui/` (emits
`data-slot`), lucide-react icons, `@` → `src/` alias, strict TypeScript.
