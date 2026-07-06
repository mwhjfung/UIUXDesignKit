---
name: orders
description: >
  Process catalogue order tickets — requests filed from the catalogue UI
  (import a screen, hand off a prototype). Use when the user runs /orders,
  says "process the catalogue requests/orders", or a session-start note
  says orders are waiting.
metadata:
  version: "1.0"
  category: workflow
---

# Orders — drain the catalogue request queue

The catalogue's buttons file order tickets into `.pdk/requests.json` at the
kit root. This skill processes them so the button "just worked" from the
designer's point of view.

## Ground rules

- Process tickets **oldest first**, one at a time.
- Only touch `pending` tickets. Never re-run `in-progress`/`done`/`failed`
  ones (Retry in the catalogue re-files a ticket as pending).
- Never delete tickets. Every state change goes through the API so the
  catalogue chips update live.
- Prefer the API (`http://localhost:5170/__api/requests`) for reads and
  updates; fall back to editing `.pdk/requests.json` directly only when
  the catalogue isn't running.

## Loop

For each pending ticket:

1. Mark it in-progress:
   `curl -s -X PATCH localhost:5170/__api/requests/<id> -H 'Content-Type: application/json' -d '{"status":"in-progress"}'`
2. Execute by type:
   - **import-screen** — run the import-screen skill flow with the
     ticket's fields: repo `screen.repoPath` (+ `screen.appDir`), screen
     file `screen.file`, prototype title `screen.title`, stack
     `screen.stack`. The skill scaffolds via the catalogue create API as
     usual.
   - **handoff** — run the handoff skill flow with slug `handoff.slug`,
     target `handoff.targetRepo` (+ `handoff.targetSubdir` when set).
     After the handoff completes, advance the prototype's status:
     `curl -s -X POST localhost:5170/__api/update-status -H 'Content-Type: application/json' -d '{"slug":"<slug>","status":"handed-off"}'`
3. Mark the outcome:
   - success → `{"status":"done","note":"<one line: what was produced, e.g. branch handoff/tasks in /path>"}`
   - failure → `{"status":"failed","note":"<plain-language reason the designer can act on>"}`
     Failure notes are shown verbatim on the catalogue card — write them
     for a designer, not a stack trace (e.g. "the target repo has
     uncommitted changes — commit or stash them, then Retry").
4. Continue to the next pending ticket. When none remain, report a short
   summary: N done, N failed (with reasons).

## Never

- Never process the same ticket twice in one run.
- Never mark a ticket done without the underlying skill's own verification
  passing (the import renders / the handoff branch exists).
- Never wire live endpoints — ticket or not, the mock-only boundary holds.
