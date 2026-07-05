# Design decisions

A running log of tangible design decisions made in this kit — visual, component, and harness choices. Captures what was tried, what felt right, and what was ruled out.

Newest entries at the top.

Entry format:

```
## YYYY-MM-DD — Your name

**Decision title**

What was tried, what felt right or wrong, and why it matters for the direction.
```

---

## 2026-07-05 — Michael Fung (with Claude)

**PDK v2: the eight decisions behind the A–E build**

1. **npm workspaces for pdk-core + catalogue only.** Stack templates and
   prototypes stay standalone apps with a `file:../../pdk-core` devDependency
   — stacks pin divergent framework majors, and `file:` paths survive the
   template→prototype copy unchanged.
2. **pdk-core is one package with subpath exports** (`@pdk/core/manifest`,
   `@pdk/core/vite`); skills stay thin wrappers over vitest-covered TS.
3. **The browser toolbar ships as a single self-contained IIFE**
   (`pdk-tools.js`): a Vue-built Markup toolbar compiled with Vue
   bundled + styles injected, loaded into any framework's page by
   `tooling/pdk-prelude.js`. CSS-module hashing isolates styles; a shadow-DOM
   wrapper was considered and skipped for v1 (Teleport-based popups would
   fight it).
4. **API topology: toolbar served by the catalogue, APIs on the prototype.**
   Each prototype's own dev server carries /markup, /__pdk/manifest, and
   /__api/update-prop; the MCP bridge discovers live servers by probing every
   prototypes/*/pdk.json port.
5. **components.json stores variant enums, not full type graphs** — exactly
   what the Tweaker UI and validation need; scanner complexity stays bounded.
6. **Tweaker writes are conservative by design**: Nth-occurrence opening-tag
   patch of simple literals only; multi-file components, out-of-range
   occurrences, and expression values 422 and route to the Markup loop.
   The vendored design system (src/components/ui) is never patched.
7. **Instance detection = manifest data-slot hints + vue/react internals for
   names only.** React 19 removed _debugSource, so file paths never come from
   the browser.
8. **Handoff is an export, not a build step**: the typed mock service layer
   (src/services/Api) is the seam; HANDOFF.md's endpoint checklist is
   generated from the interface signatures.

