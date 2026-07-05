---
name: markup
description: Start the Markup feedback loop — polls for browser annotations and applies them to prototype code. Use when the user runs /markup or asks to "apply markup feedback", "watch for annotations", or "review markup".
---

# Markup — Feedback Apply Mode

Reads annotations sent from the browser Markup toolbar and applies them to
prototype code. Each fix gets its own git commit. After fixing, resolves the
annotation so the marker turns green in the browser.

The MCP tools (`markup_get_status`, `markup_get_annotations`,
`markup_resolve_annotation`) come from the `markup` server in `.mcp.json`.
The bridge discovers every running prototype dev server automatically by
probing the ports declared in `prototypes/*/pdk.json`.

## Important: timing

Claude Code's minimum scheduling interval is 60 seconds. Checks happen at most
once per minute — not every 5 seconds. This is expected behaviour.

## Step 1: Check server status

Call `markup_get_status()`.

- If `running: false` → tell the user: "No prototype dev server is running —
  `cd prototypes/<slug> && npm run dev` first." Stop.
- If `hasPendingAction: true` → report count and go to Step 2 immediately.
- If `hasPendingAction: false` → report: "Watching for annotations. Annotate
  in the browser and click Send — I'll pick them up within ~60 seconds."

## Step 2: Apply annotations

Call `markup_get_annotations()`. The `sessionUrl` tells you which prototype
the annotations belong to (its port maps to a `prototypes/*/pdk.json`
`defaultPort`). Process each annotation one at a time:

1. Use `vueComponent` (the component name — populated on both Vue and React
   pages), `selector`, `elementPath`, and `nearbyText` to find the file in
   that prototype's `src/`.
2. Apply the fix described in `comment`. Keep the fix on-system: component
   variants and tokens must exist in the stack's manifest
   (`stack-templates/<stack>/manifest/components.json`).
3. Call `markup_resolve_annotation(id)` — the marker turns green in the browser.
4. Report: "Fixed: [comment] in [file]"
5. `git commit -m "fix: [comment]"`

## Step 3: After applying all

Call `markup_get_status()`.

- If `hasPendingAction: true` → more arrived, repeat Step 2.
- If `hasPendingAction: false` → report: "All done. Watching for more —
  annotate and click Send again." Use ScheduleWakeup with `delaySeconds: 60`
  to check back.

## Watch loop

On each ScheduleWakeup, pass `<<autonomous-loop-dynamic>>` as the prompt to
re-enter this skill. Check status, apply if pending, reschedule if not.

Stop when the user says "stop", "done", or "exit markup".

## Notes

- The annotation snapshot is saved when Send is clicked — it survives toolbar
  display clears.
- Each fix is one commit. Do not batch annotations.
- If a selector can't be found: report it, call `markup_resolve_annotation(id)`
  anyway, continue.
- Only edit files inside the prototype the session belongs to — never shared
  stack-template files from a markup fix.
