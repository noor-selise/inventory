# Scope: Cloud Inventory & Order Management (bootstrap)

A cloud inventory and order management web app for small businesses (see `docs/01-business-prd.md`). This pass covers only the bootstrap: a React + TypeScript project with Tailwind and shadcn/ui, all on the latest versions, with `docs/DESIGN.md` wired in. Product features come in a later `/scope` pass.

**Build approach:** Tracer Bullet (each feature built end to end and working before the next).
**Workflow:** Alpha (after `/develop`, run `/check verify` on the real app). The project default level of rigor. `/architect` is the recommended first stop for a feature with a real decision, but skippable when you already know the build. Any feature can carry its own tag (e.g. `· GA`) to do more or less.

_These are recommendations to keep your build orderly, not requirements. Skip anything that does not fit: if you already know how to build a feature, use `/develop` and skip `/architect`. You decide when a feature is `done`._

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| 1 | Stack & scaffold | Foundation | in-progress |
| 2 | Design system integration | Foundation | planned |

## Foundations

### 1. Stack & scaffold · in-progress
A runnable React + TypeScript project with Tailwind CSS and shadcn/ui set up, every package on its latest stable version. Nothing beyond the runnable skeleton.
**Done when:** the dev server boots, the production build and typecheck pass, and shadcn's CLI can add a component into the project.
- [x] Decide the stack (spec): `/architect stack & scaffold`
- [x] Scaffold from the decision: `/develop stack & scaffold`
- [ ] Verify it: `/check verify stack & scaffold`
Spec [0001](../specs/0001-stack-scaffold.md) · code in `./` (`src/`, `package.json`, `vite.config.ts`)

### 2. Design system integration · needs a decision
Wire `docs/DESIGN.md` into the scaffold: color tokens (dark default plus light), radius scale, DM Sans and JetBrains Mono, dark / light / system theme switching that persists, the reduced motion rule, and the custom Button variants. Other components are added later, when a feature needs them.
**Done when:** the app opens in dark by default and can switch to light or system, every token from DESIGN.md §2 and §4 is usable as a utility class (for example `bg-primary`, `text-destructive-text`), fonts load, and the Button renders all its variants and sizes with near black text on green.
- [ ] Design it (spec): `/architect design system integration`

## Deferred
Out of scope for the current build pass, kept so the plan stays honest.
- **Backend, database and auth**: decide before the first data backed feature · needs a decision · from spec 0001
- **Routing**: decide when the second screen arrives · needs a decision · from spec 0001

## Legend

**The decision box.** Every feature carries exactly one, the sub-task whose label ends with `(spec)`. Its wording varies (`Design it (spec)` normally, `Decide the stack (spec)` on Stack & scaffold), so skills locate it by that `(spec)` suffix, never by an exact label. Every other box is an execution box and `/architect` never ticks one.

**Feature lifecycle**: the scope updates as a feature moves; each row is what it shows and who sets it:

| State | Set by | The feature shows |
|---|---|---|
| `planned` · needs a decision | `/scope` | one box: `Design it (spec): /architect <feature>` |
| `in-progress` (designed) | **`/architect` at spec capture** | `Design it` ticked; spec linked; `Build it: /develop <feature>` + **2 to 5 milestones**; the tier's closing boxes (`Verify it` Alpha+, `Test it` Beta+, `Review it` + `Document it` GA); any surfaced follow-up enrolled |
| `in-progress` (building) | `/develop` | milestone sub-boxes tick one by one; code pointer filled |
| `in-progress` (verified) | `/check verify` | `Build it` + milestones ticked; `Verify it` ticked |
| `done` | **you, when you decide it is** (any skill sets it when you say so); `/sync` reconciles | boxes you ran ticked, skipped ones marked skipped; the tier's last stage (`Prototype` → after `/develop`; `Alpha` → after `/check verify`; `Beta`/`GA` → after `/test`) is the suggested point to call it done; `/sync` captures conventions |

- **Next step** = the first unticked box (always a command or a tracked milestone).
- **needs a decision** = run `/architect` first; otherwise straight to `/develop`. The tag drops once the spec is captured.
- **Atomic build tasks live in the spec's `## Build plan`, not here**: the scope carries only the milestone rollup.
- **Status** `planned` → `in-progress` → `done`, plus `existing` (pre-workflow) and `dropped` (de-scoped, kept for history).
- **Approach tag** beside a heading (e.g. `· Facade`) overrides the project default for that feature; no tag = inherits it.
- **Workflow tier tag** beside a heading (e.g. `· GA`, `· Prototype`) sets that one feature's rigor above or below the project default; no tag inherits the default.
- **Workflow** (header line) is the project default, what runs after `/develop`: **Prototype** = nothing (trust develop's own build time self check); **Alpha** = `/check verify`; **Beta** = `/check verify` then `/test`; **GA** = adds a fresh model `/check review` then `/document`. A feature built on an unratified decision (an `Assumed` spec) stays flagged, but that never blocks `done`.
- **Pointer line** (`spec <n> · code in <path>`): the spec link added by `/architect`, the code path by `/develop`.
