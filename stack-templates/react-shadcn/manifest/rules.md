# Usage rules

Read before writing any prototype code on this stack; validation checks
against these after.

## Component choices

- Always use the components in `src/components/ui/` — never raw HTML elements
  when an equivalent exists (`<Button>` not `<button>`, `<Table>` not `<table>`,
  `<Input>` not `<input>`).
- `Sheet` for record detail and secondary workflows; `Dialog` only for
  confirmations and single-field edits.
- `DropdownMenu` for row/overflow actions; never a cluster of icon buttons.
- One primary `Button` per view. Everything else is `outline`, `ghost`, or
  `secondary`.
- Need a component that isn't installed? Add it via
  `npx shadcn@latest add <name>` and re-run the manifest scaffolder — don't
  hand-roll a lookalike.

## Layout & spacing

- Tailwind spacing scale only; no arbitrary values (`p-[13px]` is a review
  reject).
- Page gutter: `px-6 py-8` inside a `max-w-*` container chosen per pattern.
- Vertical rhythm between sections: `space-y-8`; within a section: `space-y-4`.

## Color & tokens

- Semantic tokens only: `bg-background`, `text-muted-foreground`,
  `border-border`, `text-destructive`, etc. Raw palette classes
  (`bg-gray-100`, `text-red-500`) and hex values are forbidden — they break
  retheming, which is the whole point of the kit.
- Dark mode comes free from the token layer; never hardcode light-only colors.

## Data access

- UI components never fetch or invent data. Everything flows through
  `@/services/api` typed against `@/services/types`. New data needs = extend
  the `Api` interface + mock, not an inline array.

## Accessibility

- Every `Input`/`Select`/`Checkbox` gets a paired `Label` (htmlFor/id).
- Icon-only buttons get `aria-label` (and usually a `Tooltip`).
- Keep the Radix-provided focus behavior — never remove focus rings.

## Anti-patterns

- Inventing variants: a `variant` value must exist in `components.json`.
- `useEffect` chains for derived state — derive in render.
- Fake interactivity: if a control is shown, it works against the mock API.
