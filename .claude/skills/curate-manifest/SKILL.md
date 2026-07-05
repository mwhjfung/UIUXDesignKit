---
name: curate-manifest
description: Guided interview that fills in the tacit-knowledge half of a stack manifest — patterns.md, rules.md, voice.md. Use right after /scaffold-manifest, when curated files are still stubs, or when the user runs /curate-manifest <stack>.
---

# Curate a design-system manifest

The scaffolder captured what a robot can see. This skill captures what only the
team knows: preferred page patterns, "use X not Y" rules, and how the product
talks. Prototype quality is bounded by these three files.

## Ground rules

- Work through the three files in order: `patterns.md` → `rules.md` → `voice.md`
  (all in `stack-templates/<stack>/manifest/`).
- Ask **one question at a time**, following the `<!-- prompt: ... -->` comments
  embedded in each stub section.
- Write the user's answers into the file as you go, replacing the prompt
  comments. Keep their wording; tighten, don't paraphrase away specifics.
- When a section references components, verify the names exist in
  `manifest/components.json` and use the exact exported names.
- The user can skip any section — leave its prompt comment in place so a later
  pass can pick it up.
- When a file has real content in every section, delete the
  `<!-- pdk:stub ... -->` marker on line 1. Tools treat a file with that marker
  as uncurated.

## Suggested openers per file

- **patterns.md** — "When your team builds a list page, what does it look like?
  Walk me through the last one that felt right." Then turn the answer into a
  copy-pasteable skeleton using this stack's components.
- **rules.md** — "What do reviewers keep rejecting?" and "Which component do
  people reach for that they shouldn't?"
- **voice.md** — "Show me one screen whose copy feels right. What makes it
  right?" Extract tone, casing, and terminology rules from their answer.

## Wrap-up

Summarize what was captured and what was skipped. Remind the user that
`/sync-manifest <stack>` will flag these files if a future design-system
upgrade removes anything they reference.
