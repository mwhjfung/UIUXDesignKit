# Catalogue actions — buttons for scratch-start, screen-import, and handover

**Status: approved in discussion 2026-07-06.** Bridge = request queue
("order tickets"); handover = two steps (ready-for-dev status flip, then
Hand over); handoff output = branch + commit in the target repo.

## Problem

The full loop (start from scratch, build from an existing screen, hand
over to developers) currently requires typed commands in Claude Code. The
catalogue should offer these as buttons so a designer never leaves the
browser for the common actions — while respecting that screen import and
handoff are AI jobs the browser cannot perform itself.

## Decisions (user-confirmed)

1. **Bridge = request queue.** Buttons file requests ("order tickets");
   Claude Code processes them via a new `/orders` skill. Degrades
   gracefully: tickets wait until the AI is next running; a session-start
   hook announces pending tickets.
2. **Handover is two steps.** "Mark ready for dev" is a plain status flip
   on the card. "Hand over…" files the AI ticket; on completion the
   status advances to "handed off" automatically. Trail:
   `draft → ready-for-dev → handed-off`.
3. **Per-device by design.** Queue state is local and git-ignored; each
   user's catalogue + queue + Claude are self-contained. Collaboration
   happens through git (prototypes, statuses committed in pdk.json).
   Shared/team queues are explicitly out of scope.
4. **Dev pickup is a branch.** A completed handoff lands in the target
   repo as a new branch `handoff/<slug>` containing the exported code and
   `HANDOFF.md`, committed — the developer checks out the branch, follows
   the checklist, opens a PR. (Extends the existing /handoff skill, which
   currently leaves the export uncommitted.)

## UX

- **New prototype** becomes a chooser: **Start from scratch** (existing
  create flow) | **Start from an existing screen**. The latter lists
  screens discovered in linked product repos (name + repo + path); pick
  one, set a title, Create → files an `import-screen` ticket and creates
  nothing else client-side. Disabled with a hint when no product repo is
  linked.
- **Status menu** on each card's status badge: draft / in-review /
  ready-for-dev / handed-off / archived (existing values validated,
  merged, experimental remain legal — the menu shows the lifecycle five).
  Immediate `POST /__api/update-status`, no AI.
- **Hand over…** action on each card, visually emphasised when status is
  `ready-for-dev`: dialog pre-fills the destination from the stack's
  linked product repo (editable), files a `handoff` ticket.
- **Ticket chips** on cards: `queued` / `in progress` / `failed — <short
  reason>` with a **Retry** button (re-files as pending). Catalogue polls
  `GET /__api/requests` (same lightweight polling the liveness probes use).

## Architecture

### Queue store (pdk-core, tested)

`pdk-core/src/requests/store.ts` — pure functions over
`.pdk/requests.json` at the kit root (git-ignored; `.pdk/` added to root
.gitignore):

```ts
export type RequestType = 'import-screen' | 'handoff'
export type RequestStatus = 'pending' | 'in-progress' | 'done' | 'failed'
export interface CatalogueRequest {
  id: string            // crypto.randomUUID()
  type: RequestType
  status: RequestStatus
  createdAt: string     // ISO
  updatedAt: string
  note?: string         // failure reason / completion summary
  // import-screen:
  screen?: { repoPath: string; appDir: string; file: string; title: string; stack: string }
  // handoff:
  handoff?: { slug: string; targetRepo: string; targetSubdir?: string }
}
listRequests(root): CatalogueRequest[]        // [] on missing/corrupt (corrupt → rebuild empty + warning)
addRequest(root, partial): CatalogueRequest
updateRequest(root, id, patch): CatalogueRequest   // bumps updatedAt
```

### Screen discovery (pdk-core, tested)

`listScreens(repoPath, appDir)` exported from `link.ts` — walks the same
`SCREEN_DIRS` used by inspection, returns `{ file, name }[]` (name =
humanised filename). The catalogue endpoint aggregates it across every
stack template with `linkedRepos` role=product.

### Catalogue endpoints (vite-plugins.ts)

- `GET  /__api/screens` — linked product repos → discovered screens
- `GET  /__api/requests` — queue contents
- `POST /__api/requests` — file a ticket (validated shape)
- `PATCH /__api/requests/:id` — status/note updates (used by /orders)
- `POST /__api/update-status` — `{ slug, status }` → rewrites the
  prototype's pdk.json `status` (validated against the allowed set)

### AI side

- **`/orders` skill** (`.claude/skills/orders/SKILL.md`): drain the queue —
  for each `pending` ticket (oldest first): mark `in-progress`; run the
  corresponding skill flow (`import-screen` with the ticket's screen
  fields; `handoff` with slug + target, extended to commit on a
  `handoff/<slug>` branch); on success mark `done` with a one-line note
  and, for handoffs, `POST /__api/update-status` → `handed-off`; on
  failure mark `failed` with a plain-language reason. Never delete
  tickets; never process the same ticket twice (skip non-pending).
- **Session-start hook** (`.claude/settings.json`): prints "N catalogue
  order(s) waiting — run /orders" when `.pdk/requests.json` has pending
  entries.
- **/handoff skill extension**: after a successful export + verification,
  create branch `handoff/<slug>` in the target repo and commit the
  exported files + HANDOFF.md (branch name suffixed `-2`, `-3`… if taken).
  The dev picks up by checking out that branch.

## Error handling

- Failed tickets persist with reasons on the card + Retry.
- Corrupt queue file → rebuilt empty, warning logged and shown once.
- No linked product repo → screen option disabled with explainer; screens
  endpoint returns `{ screens: [], reason }`.
- Linked repo path missing at click time → ticket refuses to file with
  the stored path in the message.
- Handoff preflight failures (dirty target tree, framework mismatch)
  surface as the ticket's failure note verbatim.
- Status endpoint rejects unknown statuses and unknown slugs (404/422).

## Testing

- Unit (pdk-core): store CRUD incl. corrupt-file rebuild and unknown-id;
  `listScreens` against the existing link fixtures (vendored-app has
  src/pages/Tasks.tsx → one screen, ds-repo → none).
- Endpoint smoke: file → list → patch → update-status round-trip against
  a scratch kit root.
- Skill-side is instruction prose over tested pieces, exercised end-to-end
  once via the fixture flow (file an import ticket, run /orders, prototype
  exists and ticket is done).

## Out of scope

- Shared/team queues, auth, central hosting (per-device by design).
- Auto-running Claude headlessly from the catalogue ("robot chef").
- Notifications beyond the session-start hook and card chips.
