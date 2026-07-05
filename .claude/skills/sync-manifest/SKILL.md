---
name: sync-manifest
description: Detect design-system drift after a package upgrade and refresh the scanned manifest files, flagging stale curated content. Use after npm update in a stack template, or when the user runs /sync-manifest <stack>.
---

# Sync a design-system manifest

Re-scans the design system and diffs against the current manifest. JSON files
are regenerated; curated markdown is **never** edited automatically.

When the stack's `pdk.json` has `linkedRepos`, sync first refreshes the
template's copies from the linked repos (vendored ui, linked-tokens.css —
see `syncLink` in `@pdk/core`) and reports per-repo commit drift and any
missing repo paths before diffing the manifest. A missing linked repo is
reported with its stored path — ask the user for the new location and
update the entry rather than failing.

## Steps

1. Run from the repo root:
   ```bash
   npm run build:core
   node pdk-core/dist/manifest/sync.js <stack> --root .
   ```
2. Relay the diff to the user in plain language, e.g. "Button gained a
   'subtle' variant; Card lost its 'padding' prop; 12 icons added."
3. If the report flags stale references (curated MD files mentioning removed
   components/props), walk the user through each one and edit the MD **only
   with their confirmation**.
4. If the command refuses because the installed version is *older* than the
   recorded one, someone downgraded — confirm with the user before re-running
   with `--force`.

## Notes

- `up to date` output means recorded package versions match installed ones.
  For copy-installed (shadcn-style) systems the scan always re-runs, since
  local source edits are drift too.
- The diff is also the changelog for prototypes: mention anything that might
  visually change existing prototypes built on this stack.
