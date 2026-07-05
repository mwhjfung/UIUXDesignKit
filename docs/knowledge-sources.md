# Knowledge sources

The registry the `design-advisory` skill reads to ground prototypes in your
organisation's real domain knowledge. Uncommented entries are queried during
advisory research; the trust level controls how conflicts are resolved.

**Trust levels**
- `authoritative` — curated, reviewed knowledge. Always wins conflicts.
- `additive` — live documentation. Fills gaps; never overrides authoritative.
- `signal` — activity data (tickets, work items, analytics). Context only.

When two sources conflict, the higher-trust definition goes in the brief and
the discrepancy is flagged explicitly — never silently blended.

## Sources

<!-- Uncomment and adapt. MCP sources reference servers configured in .mcp.json
     or your user-level MCP config; path sources are read from disk. -->

<!--
### design-context (MCP)
- type: mcp
- server: your-design-context-mcp
- trust: authoritative
- use-for: personas / role types, workflows, domain terminology, competitive analysis
- notes: Ask which portfolio/product area first; list available artefacts, then load the relevant ones.
-->

<!--
### product-docs (MCP)
- type: mcp
- server: your-knowledge-base-mcp
- trust: additive
- use-for: current feature behaviour, field names, terminology currency checks
-->

<!--
### research-repository (path)
- type: path
- location: areas/
- trust: authoritative
- use-for: interview findings, usability results, briefs for the workstream being prototyped
-->

<!--
### issue-tracker (MCP)
- type: mcp
- server: your-tracker-mcp
- trust: signal
- use-for: what is being built right now, who owns it
-->

## No sources configured?

The advisory skill still runs: it warns that output will be generic, gathers
what it can from the conversation, and writes the brief from that. Add sources
here as they become available — prototype quality scales with this file.
