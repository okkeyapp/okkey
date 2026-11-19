# Annotations

One directory per page id (`<domain>__<url-hash8>/`).

- `annotator-a.json` — first annotator (drafted in the measurement PR for capturable pages; `blocked` / `uncapturable` when capture failed).
- `annotator-b.json` — second independent annotator. Empty stubs (`status: "empty"`) until filled later.

A field/form enters metric denominators only when both files agree on the same form id, selectors, and roles. See the parent `README.md` for the schema and metrics.
