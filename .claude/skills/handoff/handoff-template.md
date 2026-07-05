# Handoff: {{title}}

> Exported from the Product Design Kit on {{date}}. Design intent and domain
> context: see `DESIGN-CONTEXT.md` in this directory.

## What this is

{{intent — 2-3 sentences from context.md: what the screen does, who it's for,
what workflow it serves}}

## Connect real endpoints

The UI is fully wired against a typed mock service layer. To ship it,
implement the `Api` interface in `services/api.ts` against your backend:

{{for each Api method:}}
- [ ] `{{methodSignature}}`
      {{one line: what the UI uses it for, which fixture shows the expected shape}}

- [ ] Swap the export in `services/api.ts` from `mockApi` to your
      implementation
- [ ] Delete `services/api.mock.ts` and `services/fixtures/`

The domain types the UI depends on are in `services/types.ts` — treat them as
the contract; adjust your mapping layer, not the UI, where your API differs.

## Component inventory

{{table: component | variants used | source (vendored here / already in your
repo / design-system package)}}

{{divergence notes when the target already had its own copies}}

## Styling & tokens

{{what token layer the code expects, where it lives, what import (if any) the
target app shell must add, dark-mode notes}}

## States implemented

{{list: loading / empty / error / long-content states that exist, and how
they're triggered with the mock}}

## Known gaps

{{from context.md Open questions + anything the exporter noticed — be blunt;
this section is why devs trust the handoff}}

## Verification at export time

{{typecheck/build results in the target repo, exact commands run}}
