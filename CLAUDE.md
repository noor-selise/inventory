<!-- blocks-skills:start -->
## SELISE Blocks

For Blocks work in this repo, read [AGENTS.md](./AGENTS.md) and follow the Blocks section there.

This block scopes Blocks rules only; it says nothing about the rest of this file. Keep Blocks
guidance in `AGENTS.md` rather than duplicating it here — a second copy will drift.
<!-- blocks-skills:end -->

## EGM

EGM artifact directory: egm

Inside `egm/`, write each EGM file to its own subfolder, never to `egm/` itself or the repo root:
- `egm/reviews/`: review reports (`zoom_out_report.md`, `comprehension_report.md`, `critic_report.md`, `intermediate_zoom_out_report.md`, `implementation_readiness_report.md`, `goldfish_review_report.md`, `consolidated_review_report.md`)
- `egm/drift/`: drift reports (`{YYYY-MM-DD}_DRIFT_REPORT.md`)
- `egm/drafts/`: brainstorm briefs and `design_draft.md`

Directory READMEs from `/egm:egm-bootstrap` stay beside their code in `src/`; they are gitignored.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.
