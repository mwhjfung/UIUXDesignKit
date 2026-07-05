# Example: Tasks

### Prompt
> Worked example shipped with the kit: a task-list screen with filters,
> status badges, and a detail sheet.

### Intent
Show the full PDK anatomy in one small screen: manifest components only, the
typed mock-service seam, list/detail pattern from patterns.md, and working
states — so new users have a reference before building their own.

### Domain context
**Area**: General exploration — kit example, no organisation domain.
**Sources**: none (example content).

### Audience
- **Role(s)**: Team member — checks what's on their plate, marks work done.
- **Device/environment**: Desktop browser.

### Key terminology
- **Task**: a unit of work with status, priority, assignee, project, due date.
- **Project**: a grouping label for tasks.

### User workflow
1. Scan the list, filter by status or search by title.
2. Open a task to see its details.
3. Mark a task done (from the row menu or the detail sheet).

### Key data fields
- **status**: todo | in-progress | blocked | done
- **priority**: low | medium | high
- **dueDate**: nullable ISO date — renders as "—" when unset.

### Design considerations
- Follows the manifest's list-page and record-detail patterns (toolbar over
  table; Sheet for detail; Dialog reserved for confirmations).
- Blocked renders destructive; done renders outline — one glance status read.
- Loading and empty states implemented in-table per rules.md.

### Confidence notes
Example data is invented; quantities are small on purpose.

### Open questions
- (none — reference example)
